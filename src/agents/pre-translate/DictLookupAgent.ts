import { BaseAgent, type AgentRunContext } from '../base';
import { dictionaryTool } from '../tools/dictionary';
import { DictEntry, TermCandidate } from '@/types/terms';

export class DictLookupAgent extends BaseAgent<
    {
        terms: TermCandidate[];
        tenantId?: string;
        userId?: string;
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
        input: { terms: TermCandidate[]; tenantId?: string; userId?: string; locale?: string },
        _ctx?: AgentRunContext
    ): Promise<DictEntry[]> {
        return dictionaryTool.lookup(input.terms, {
            tenantId: input.tenantId,
            userId: input.userId,
        });
    }
}
