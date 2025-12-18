import { AgentNode } from './AgentNode';
import { ProcessingNode } from './ProcessingNode';
import { TerminalNode } from './TerminalNode';

export { AgentNode, ProcessingNode };
export * from './AgentNode';
export * from './ProcessingNode';
export * from './TerminalNode';

export const nodeTypes = {
    agentNode: AgentNode,
    processingNode: ProcessingNode,
    terminalNode: TerminalNode,
};
