import { spawnSync } from 'child_process';

type Step = {
  name: string;
  command: string[];
  skip?: boolean;
  skipReason?: string;
};

function run(step: Step) {
  if (step.skip) {
    console.log(`SKIP ${step.name}: ${step.skipReason}`);
    return;
  }

  console.log(`RUN ${step.name}: ${step.command.join(' ')}`);
  const result = spawnSync(step.command[0] || '', step.command.slice(1), {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error(`${step.name} failed with exit code ${result.status ?? 'unknown'}`);
  }
}

const hasDatabase = Boolean(process.env.DATABASE_URL);
const steps: Step[] = [
  { name: 'type-check', command: ['yarn', 'type-check'] },
  { name: 'security scan', command: ['yarn', 'security:scan'] },
  {
    name: 'tenant backfill dry-run',
    command: ['yarn', 'tenant:backfill'],
    skip: !hasDatabase,
    skipReason: 'DATABASE_URL is not set',
  },
  {
    name: 'security isolation smoke',
    command: ['yarn', 'security:isolation-smoke'],
    skip: !hasDatabase,
    skipReason: 'DATABASE_URL is not set',
  },
];

try {
  for (const step of steps) run(step);
  console.log('PASS security verification');
} catch (error) {
  console.error(error);
  process.exit(1);
}
