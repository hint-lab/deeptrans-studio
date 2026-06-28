import { prisma } from '@/lib/db';
import {
  type AuthContext,
  GuardError,
  requireAccessibleDictionary,
  requireOwnedDocument,
  requireOwnedDocumentItem,
  requireOwnedMemory,
  requireOwnedProject,
  requireOwnedProjectDocument,
  requireWritableDictionary,
  requireWritableDocument,
  requireWritableDocumentItem,
  requireWritableProject,
} from '@/lib/guards';

type Check = {
  label: string;
  run: () => Promise<void>;
};

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const prefix = `security-smoke-${stamp}`;

const tenantAId = `${prefix}-tenant-a`;
const tenantBId = `${prefix}-tenant-b`;
const userAId = `${prefix}-user-a`;
const userA2Id = `${prefix}-user-a2`;
const userBId = `${prefix}-user-b`;
const projectAId = `${prefix}-project-a`;
const projectBId = `${prefix}-project-b`;
const documentAId = `${prefix}-document-a`;
const itemAId = `${prefix}-item-a`;
const privateDictionaryAId = `${prefix}-dict-a`;
const projectDictionaryAId = `${prefix}-dict-project-a`;
const publicDictionaryId = `${prefix}-dict-public`;
const memoryAId = `${prefix}-memory-a`;

const ctxA: AuthContext = { userId: userAId, tenantId: tenantAId, role: 'USER' };
const ctxA2: AuthContext = { userId: userA2Id, tenantId: tenantAId, role: 'USER' };
const ctxB: AuthContext = { userId: userBId, tenantId: tenantBId, role: 'USER' };

async function seed() {
  await prisma.tenant.createMany({
    data: [
      { id: tenantAId, name: `${prefix} Tenant A` },
      { id: tenantBId, name: `${prefix} Tenant B` },
    ],
  });
  await prisma.user.createMany({
    data: [
      { id: userAId, email: `${prefix}-a@example.com`, name: 'Smoke A', tenantId: tenantAId },
      { id: userA2Id, email: `${prefix}-a2@example.com`, name: 'Smoke A2', tenantId: tenantAId },
      { id: userBId, email: `${prefix}-b@example.com`, name: 'Smoke B', tenantId: tenantBId },
    ],
  });
  await prisma.project.create({
    data: {
      id: projectAId,
      name: `${prefix} Project A`,
      domain: 'security',
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      date: new Date(),
      userId: userAId,
      tenantId: tenantAId,
    },
  });
  await prisma.project.create({
    data: {
      id: projectBId,
      name: `${prefix} Project B`,
      domain: 'security',
      sourceLanguage: 'en',
      targetLanguage: 'zh',
      date: new Date(),
      userId: userAId,
      tenantId: tenantAId,
    },
  });
  await prisma.document.create({
    data: {
      id: documentAId,
      name: 'Smoke document',
      originalName: 'smoke.txt',
      url: 'memory://smoke.txt',
      mimeType: 'text/plain',
      size: 12,
      projectId: projectAId,
      userId: userAId,
    },
  });
  await prisma.documentItem.create({
    data: {
      id: itemAId,
      documentId: documentAId,
      order: 1,
      sourceText: 'hello',
      targetText: '你好',
      userId: userAId,
    },
  });
  await prisma.dictionary.createMany({
    data: [
      {
        id: privateDictionaryAId,
        name: `${prefix} Private Dictionary A`,
        domain: 'security',
        visibility: 'PRIVATE',
        userId: userAId,
        tenantId: tenantAId,
      },
      {
        id: projectDictionaryAId,
        name: `${prefix} Project Dictionary A`,
        domain: 'security',
        visibility: 'PROJECT',
        tenantId: tenantAId,
      },
      {
        id: publicDictionaryId,
        name: `${prefix} Public Dictionary`,
        domain: 'security',
        visibility: 'PUBLIC',
      },
    ],
  });
  await prisma.projectDictionary.create({
    data: {
      projectId: projectAId,
      dictionaryId: projectDictionaryAId,
    },
  });
  await prisma.translationMemory.create({
    data: {
      id: memoryAId,
      name: `${prefix} Memory A`,
      sourceText: 'en',
      targetText: 'zh',
      userId: userAId,
      tenantId: tenantAId,
    },
  });
}

async function cleanup() {
  await prisma.user.deleteMany({ where: { id: { in: [userAId, userA2Id, userBId] } } });
  await prisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  await prisma.dictionary.deleteMany({ where: { id: publicDictionaryId } });
}

async function expectAllowed(label: string, run: () => Promise<unknown>) {
  await run();
  console.log(`PASS ${label}`);
}

async function expectDenied(label: string, run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    if (error instanceof GuardError && (error.status === 401 || error.status === 404)) {
      console.log(`PASS ${label}`);
      return;
    }
    throw error;
  }
  throw new Error(`Expected denial: ${label}`);
}

const checks: Check[] = [
  {
    label: 'owner can access own project',
    run: () => expectAllowed('owner can access own project', () => requireOwnedProject(projectAId, ctxA)),
  },
  {
    label: 'same tenant can access tenant project',
    run: () =>
      expectAllowed('same tenant can access tenant project', () => requireOwnedProject(projectAId, ctxA2)),
  },
  {
    label: 'owner can write own project',
    run: () =>
      expectAllowed('owner can write own project', () => requireWritableProject(projectAId, ctxA)),
  },
  {
    label: 'same tenant cannot write tenant project',
    run: () =>
      expectDenied('same tenant cannot write tenant project', () => requireWritableProject(projectAId, ctxA2)),
  },
  {
    label: 'cross tenant cannot access project',
    run: () => expectDenied('cross tenant cannot access project', () => requireOwnedProject(projectAId, ctxB)),
  },
  {
    label: 'cross tenant cannot access document',
    run: () => expectDenied('cross tenant cannot access document', () => requireOwnedDocument(documentAId, ctxB)),
  },
  {
    label: 'owner can write own document',
    run: () =>
      expectAllowed('owner can write own document', () => requireWritableDocument(documentAId, ctxA)),
  },
  {
    label: 'same tenant cannot write tenant document',
    run: () =>
      expectDenied('same tenant cannot write tenant document', () => requireWritableDocument(documentAId, ctxA2)),
  },
  {
    label: 'cross tenant cannot write document',
    run: () =>
      expectDenied('cross tenant cannot write document', () => requireWritableDocument(documentAId, ctxB)),
  },
  {
    label: 'same owner cannot use document in another project context',
    run: () =>
      expectDenied('same owner cannot use document in another project context', () =>
        requireOwnedProjectDocument(projectBId, documentAId, ctxA)
      ),
  },
  {
    label: 'cross tenant cannot access document item',
    run: () =>
      expectDenied('cross tenant cannot access document item', () => requireOwnedDocumentItem(itemAId, ctxB)),
  },
  {
    label: 'owner can write own document item',
    run: () =>
      expectAllowed('owner can write own document item', () => requireWritableDocumentItem(itemAId, ctxA)),
  },
  {
    label: 'same tenant cannot write document item',
    run: () =>
      expectDenied('same tenant cannot write document item', () => requireWritableDocumentItem(itemAId, ctxA2)),
  },
  {
    label: 'same tenant cannot access private dictionary',
    run: () =>
      expectDenied('same tenant cannot access private dictionary', () =>
        requireAccessibleDictionary(privateDictionaryAId, ctxA2)
      ),
  },
  {
    label: 'same tenant can access project dictionary',
    run: () =>
      expectAllowed('same tenant can access project dictionary', () =>
        requireAccessibleDictionary(projectDictionaryAId, ctxA2)
      ),
  },
  {
    label: 'owner can write project dictionary',
    run: () =>
      expectAllowed('owner can write project dictionary', () =>
        requireWritableDictionary(projectDictionaryAId, ctxA)
      ),
  },
  {
    label: 'same tenant cannot write project dictionary',
    run: () =>
      expectDenied('same tenant cannot write project dictionary', () =>
        requireWritableDictionary(projectDictionaryAId, ctxA2)
      ),
  },
  {
    label: 'cross tenant cannot access private dictionary',
    run: () =>
      expectDenied('cross tenant cannot access private dictionary', () =>
        requireAccessibleDictionary(privateDictionaryAId, ctxB)
      ),
  },
  {
    label: 'public dictionary is readable',
    run: () =>
      expectAllowed('public dictionary is readable', () => requireAccessibleDictionary(publicDictionaryId, ctxB)),
  },
  {
    label: 'public dictionary is not writable',
    run: () =>
      expectDenied('public dictionary is not writable', () => requireWritableDictionary(publicDictionaryId, ctxB)),
  },
  {
    label: 'same tenant cannot access user memory',
    run: () => expectDenied('same tenant cannot access user memory', () => requireOwnedMemory(memoryAId, ctxA2)),
  },
  {
    label: 'cross tenant cannot access memory',
    run: () => expectDenied('cross tenant cannot access memory', () => requireOwnedMemory(memoryAId, ctxB)),
  },
];

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for security isolation smoke test');
  }

  await seed();
  try {
    for (const check of checks) {
      await check.run();
    }
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

main().catch(async error => {
  await cleanup().catch(() => undefined);
  await prisma.$disconnect().catch(() => undefined);
  console.error(error);
  process.exit(1);
});
