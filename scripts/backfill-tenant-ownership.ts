import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const write = process.argv.includes('--write');

type Counter = {
  usersTenantCreated: number;
  projectsUpdated: number;
  dictionariesUpdatedFromUser: number;
  dictionariesUpdatedFromProject: number;
  memoriesUpdatedFromUser: number;
  memoriesUpdatedFromProject: number;
  orphanProjects: number;
  orphanDictionaries: number;
  orphanMemories: number;
};

const counter: Counter = {
  usersTenantCreated: 0,
  projectsUpdated: 0,
  dictionariesUpdatedFromUser: 0,
  dictionariesUpdatedFromProject: 0,
  memoriesUpdatedFromUser: 0,
  memoriesUpdatedFromProject: 0,
  orphanProjects: 0,
  orphanDictionaries: 0,
  orphanMemories: 0,
};

function note(message: string) {
  console.log(`${write ? 'WRITE' : 'DRY'} ${message}`);
}

function plannedTenantIdForUser(userId: string) {
  return write ? '' : `[new tenant for user ${userId}]`;
}

async function update(model: string, id: string, data: Record<string, unknown>) {
  if (!write) return;
  if (model === 'user') await prisma.user.update({ where: { id }, data });
  else if (model === 'project') await prisma.project.update({ where: { id }, data });
  else if (model === 'dictionary') await prisma.dictionary.update({ where: { id }, data });
  else if (model === 'translationMemory') {
    await prisma.translationMemory.update({ where: { id }, data });
  }
}

async function ensureUserTenants() {
  const users = await prisma.user.findMany({
    where: { tenantId: null },
    select: { id: true, name: true, email: true },
  });

  const planned = new Map<string, string>();
  for (const user of users) {
    const label = user.name || user.email?.split('@')[0] || 'User';
    if (write) {
      const tenant = await prisma.tenant.create({
        data: {
          name: `${label} Workspace`,
          description: 'Backfilled default tenant for user isolation',
          users: { connect: { id: user.id } },
        },
        select: { id: true },
      });
      planned.set(user.id, tenant.id);
    } else {
      planned.set(user.id, plannedTenantIdForUser(user.id));
    }
    counter.usersTenantCreated += 1;
    note(`user ${user.id} tenant <- ${planned.get(user.id)}`);
  }
  return planned;
}

async function userTenantMap(planned: Map<string, string>) {
  const users = await prisma.user.findMany({ select: { id: true, tenantId: true } });
  return new Map(users.map(user => [user.id, user.tenantId || planned.get(user.id) || null]));
}

async function backfillProjects(users: Map<string, string | null>) {
  const allProjects = await prisma.project.findMany({ select: { id: true, tenantId: true } });
  const projectTenants = new Map(allProjects.map(project => [project.id, project.tenantId]));
  const projects = await prisma.project.findMany({
    where: { tenantId: null },
    select: { id: true, userId: true },
  });

  for (const project of projects) {
    const tenantId = project.userId ? users.get(project.userId) : null;
    if (!tenantId) {
      counter.orphanProjects += 1;
      note(`project ${project.id} has no inferable tenant`);
      continue;
    }
    await update('project', project.id, { tenantId });
    projectTenants.set(project.id, tenantId);
    counter.projectsUpdated += 1;
    note(`project ${project.id} tenant <- ${tenantId}`);
  }

  return projectTenants;
}

async function backfillDictionaries(
  users: Map<string, string | null>,
  projects: Map<string, string | null>
) {
  const dictionaries = await prisma.dictionary.findMany({
    where: {
      tenantId: null,
      NOT: { visibility: 'PUBLIC' },
    },
    select: {
      id: true,
      userId: true,
      projectBindings: { select: { projectId: true, project: { select: { tenantId: true } } }, take: 1 },
    },
  });

  for (const dictionary of dictionaries) {
    const fromUser = dictionary.userId ? users.get(dictionary.userId) : null;
    const binding = dictionary.projectBindings[0];
    const fromProject = binding?.project?.tenantId || projects.get(binding?.projectId || '') || null;
    const tenantId = fromUser || fromProject;

    if (!tenantId) {
      counter.orphanDictionaries += 1;
      note(`dictionary ${dictionary.id} has no inferable tenant`);
      continue;
    }
    await update('dictionary', dictionary.id, { tenantId });
    if (fromUser) counter.dictionariesUpdatedFromUser += 1;
    else counter.dictionariesUpdatedFromProject += 1;
    note(`dictionary ${dictionary.id} tenant <- ${tenantId}`);
  }
}

async function backfillMemories(
  users: Map<string, string | null>,
  projects: Map<string, string | null>
) {
  const memories = await prisma.translationMemory.findMany({
    where: { tenantId: null },
    select: {
      id: true,
      userId: true,
      projectBindings: { select: { projectId: true, project: { select: { tenantId: true } } }, take: 1 },
    },
  });

  for (const memory of memories) {
    const fromUser = memory.userId ? users.get(memory.userId) : null;
    const binding = memory.projectBindings[0];
    const fromProject = binding?.project?.tenantId || projects.get(binding?.projectId || '') || null;
    const tenantId = fromUser || fromProject;

    if (!tenantId) {
      counter.orphanMemories += 1;
      note(`memory ${memory.id} has no inferable tenant`);
      continue;
    }
    await update('translationMemory', memory.id, { tenantId });
    if (fromUser) counter.memoriesUpdatedFromUser += 1;
    else counter.memoriesUpdatedFromProject += 1;
    note(`memory ${memory.id} tenant <- ${tenantId}`);
  }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

  if (!write) {
    console.log('Running dry-run. Re-run with --write to apply changes.');
  }

  const plannedUsers = await ensureUserTenants();
  const users = await userTenantMap(plannedUsers);
  const projects = await backfillProjects(users);
  await backfillDictionaries(users, projects);
  await backfillMemories(users, projects);

  console.log(JSON.stringify(counter, null, 2));
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
