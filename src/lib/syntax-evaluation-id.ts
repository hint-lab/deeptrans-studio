import { randomUUID } from 'node:crypto';

export function createSyntaxEvaluationId(uuid: string = randomUUID()): string {
    return `syntax-qa-${uuid}`;
}
