import { Injectable } from '@nestjs/common';
import { TEMPLATE_UNKNOWN_VARIABLE } from './sequence.errors';

const ALLOWED_VARIABLES = new Set([
  'leadFullName',
  'leadFirstName',
  'leadPhone',
  'leadEmail',
  'leadWilaya',
  'leadCommune',
  'agentName',
  'companyName',
  'leadBudgetMin',
  'leadBudgetMax',
  'leadWantedType',
]);

const VAR_REGEX = /\{\{(\w+)\}\}/g;

@Injectable()
export class SequenceRendererService {
  extractVariables(text: string): string[] {
    const vars: string[] = [];
    let match: RegExpExecArray | null;
    const re = new RegExp(VAR_REGEX.source, 'g');
    while ((match = re.exec(text)) !== null) {
      if (!vars.includes(match[1])) vars.push(match[1]);
    }
    return vars;
  }

  validateVariables(text: string, subject?: string | null): void {
    const allText = subject ? `${subject} ${text}` : text;
    const vars = this.extractVariables(allText);
    for (const v of vars) {
      if (!ALLOWED_VARIABLES.has(v)) {
        throw TEMPLATE_UNKNOWN_VARIABLE(v);
      }
    }
  }

  buildContext(lead: any, org: any, owner?: any): Record<string, string> {
    const fullName = lead.fullName ?? '';
    const firstName = fullName.split(' ')[0] ?? '';
    return {
      leadFullName: fullName,
      leadFirstName: firstName,
      leadPhone: lead.phone ?? '',
      leadEmail: lead.email ?? '',
      leadWilaya: lead.wilaya ?? '',
      leadCommune: lead.commune ?? '',
      agentName: owner?.name ?? '',
      companyName: org?.name ?? '',
      leadBudgetMin: lead.budgetMin != null ? String(lead.budgetMin) : '',
      leadBudgetMax: lead.budgetMax != null ? String(lead.budgetMax) : '',
      leadWantedType: lead.propertyType ?? '',
    };
  }

  render(template: string, context: Record<string, string>): string {
    return template
      .replace(VAR_REGEX, (_match, varName) => context[varName] ?? '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  renderTemplate(
    body: string,
    subject: string | null | undefined,
    context: Record<string, string>,
  ): { renderedBody: string; renderedSubject?: string } {
    const renderedBody = this.render(body, context);
    const renderedSubject = subject ? this.render(subject, context) : undefined;
    return { renderedBody, renderedSubject };
  }

  getAllowedVariables(): string[] {
    return Array.from(ALLOWED_VARIABLES);
  }
}
