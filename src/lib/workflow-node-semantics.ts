import { isWorkflowPromptKey, type WorkflowPromptKey } from './workflow-prompt-keys';

/**
 * A workflow node can either run an account-configurable prompt or retrieve
 * reference data. Keep that distinction in data, rather than inferring it
 * from a label, so a retrieval step can never accidentally open the prompt
 * editor.
 */
export type WorkflowNodeKind = 'reference';

export type WorkflowNodeData = {
    label: string;
    description?: string;
    promptKey?: unknown;
    nodeKind?: WorkflowNodeKind;
    [key: string]: unknown;
};

export type WorkflowNodeSemantics =
    | {
          kind: 'prompt';
          promptKey: WorkflowPromptKey;
          isPromptConfigurable: true;
          isReference: false;
      }
    | {
          kind: 'reference';
          promptKey: undefined;
          isPromptConfigurable: false;
          isReference: true;
      }
    | {
          kind: 'static';
          promptKey: undefined;
          isPromptConfigurable: false;
          isReference: false;
      };

export function getWorkflowNodeSemantics(
    data: WorkflowNodeData | undefined
): WorkflowNodeSemantics {
    // Reference nodes intentionally win if an invalid workflow definition ever
    // carries both fields. Their data lookup must not become a user prompt by
    // accident.
    if (data?.nodeKind === 'reference') {
        return {
            kind: 'reference',
            promptKey: undefined,
            isPromptConfigurable: false,
            isReference: true,
        };
    }

    if (isWorkflowPromptKey(data?.promptKey)) {
        return {
            kind: 'prompt',
            promptKey: data.promptKey,
            isPromptConfigurable: true,
            isReference: false,
        };
    }

    return {
        kind: 'static',
        promptKey: undefined,
        isPromptConfigurable: false,
        isReference: false,
    };
}
