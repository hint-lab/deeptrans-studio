import { BaseAgent, type AgentRunContext } from '../base';
import { dictionaryTool } from '../tools/dictionary';
import { DictEntry, TermCandidate } from '@/types/terms';
import type { AuthContext } from '@/lib/guards';

export class DictLookupAgent extends BaseAgent<
    {
        terms: TermCandidate[];
        owner?: AuthContext;
        locale?: string;
        domain?: string;
    },
    DictEntry[]
> {
    constructor(locale?: string, domain?: string) {
        super({
            name: 'dict-lookup',
            role: 'terminology_assistant',
            domain: domain || 'general',
            specialty: '术语库查询', // This will be replaced by i18n
            locale: locale || 'zh',
        });
    }

    async execute(
        input: { terms: TermCandidate[]; owner?: AuthContext; locale?: string },
        _ctx?: AgentRunContext
    ): Promise<DictEntry[]> {
        return dictionaryTool.lookup(input.terms, {
            owner: input.owner,
        });
    }
}
