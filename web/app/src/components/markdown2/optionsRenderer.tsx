import MarkdownIt from 'markdown-it';

/**
 * 解析 ```options 代码块
 * 格式：首行为问题（可省略），以 "-" / "*" / "数字." 开头的行为选项
 */
export const parseOptionsBlock = (
  code: string,
): { question: string; options: string[] } => {
  const options: string[] = [];
  const questionLines: string[] = [];
  code.split('\n').forEach(raw => {
    const line = raw.trim();
    if (!line) return;
    const match = line.match(/^(?:[-*]|\d+[.、)])\s*(.+)$/);
    if (match) {
      options.push(match[1].trim());
    } else if (options.length === 0) {
      questionLines.push(line.replace(/^(?:问题|question)[:：]\s*/i, ''));
    }
  });
  return { question: questionLines.join(' '), options };
};

/**
 * 创建选项卡片渲染器，点击事件由 MarkDown2 通过事件代理处理
 */
export const createOptionsRenderer = (md: MarkdownIt) => {
  return (code: string, index: number): string => {
    const { question, options } = parseOptionsBlock(code);
    if (options.length === 0) return '';
    const name = `chat-options-${index}`;
    const items = options
      .map(option => {
        const safe = md.utils.escapeHtml(option);
        return `<label class="chat-options-item"><input type="radio" name="${name}" value="${safe}" /><span>${safe}</span></label>`;
      })
      .join('');
    const title = question
      ? `<div class="chat-options-question">${md.utils.escapeHtml(question)}</div>`
      : '';
    return `<div class="chat-options">${title}${items}<button type="button" class="chat-options-submit" disabled>确认并继续 →</button></div>`;
  };
};
