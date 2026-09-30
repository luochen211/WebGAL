export enum SegmentType {
  String = 'SegmentType.String',
  Link = 'SegmentType.Link',
}

export interface EnhancedValue {
  text: string;
  ruby: string;
  values: { key: string; value: string }[];
}

interface Segment {
  type: SegmentType;
  value?: string | EnhancedValue;
}

/** Find the outer closing parenthesis without consuming CSS functions or strings. */
function findEnhanceEnd(input: string, start: number): number {
  let depth = 1;
  let quote = '';
  let isStyle = false;

  for (let index = start; index < input.length; index++) {
    const char = input[index];
    if (char === '\\') {
      index++;
    } else if (quote) {
      if (char === quote) quote = '';
    } else if (isStyle && char === '/' && input[index + 1] === '*') {
      const commentEnd = input.indexOf('*/', index + 2);
      if (commentEnd === -1) return -1;
      index = commentEnd + 1;
    } else if (isStyle && (char === '"' || char === "'")) {
      quote = char;
    } else if (char === '(') {
      depth++;
    } else if (char === ')') {
      depth--;
      if (depth === 0) return index;
    } else if (index === start || /\s/.test(input[index - 1])) {
      const attribute = /^(\S+)=/.exec(input.slice(index));
      if (attribute) {
        // CSS strings/comments do not change literal ruby or tips text (e.g. 'tis).
        isStyle = attribute[1] === 'style' || attribute[1] === 'style-alltext';
      }
    }
  }

  return -1;
}

export function parseTextSegments(input: string): Segment[] {
  const result: Segment[] = [];
  let searchStart = 0;
  let textStart = 0;

  while (searchStart < input.length) {
    const textOpen = input.indexOf('[', searchStart);
    if (textOpen === -1) break;
    const textClose = input.indexOf(']', textOpen + 1);
    if (textClose === -1) break;
    searchStart = textClose + 1;
    if (textClose === textOpen + 1 || input[textClose + 1] !== '(') continue;

    const enhanceStart = textClose + 2;
    const enhanceEnd = findEnhanceEnd(input, enhanceStart);
    // Leave incomplete markup as ordinary text, without repeatedly scanning its suffix.
    if (enhanceEnd === -1) break;
    if (enhanceEnd === enhanceStart) continue;

    if (textOpen > textStart) {
      result.push({ type: SegmentType.String, value: input.slice(textStart, textOpen) });
    }
    const text = input.slice(textOpen + 1, textClose);
    const enhance = input.slice(enhanceStart, enhanceEnd);
    let parsedEnhanced: KeyValuePair[] = [];
    let ruby = '';
    if (enhance.match(/style=|tips=|ruby=|style-alltext=/)) {
      parsedEnhanced = parseEnhancedString(enhance);
      const rubyKvPair = parsedEnhanced.find((e) => e.key === 'ruby');
      if (rubyKvPair) {
        ruby = rubyKvPair.value;
      }
    } else {
      ruby = enhance;
    }
    result.push({ type: SegmentType.Link, value: { text, ruby, values: parsedEnhanced } });
    textStart = enhanceEnd + 1;
    searchStart = textStart;
  }

  if (textStart < input.length) {
    result.push({ type: SegmentType.String, value: input.slice(textStart) });
  }

  // Preserve the leading empty node expected by rich text at the beginning of a line.
  result.unshift({ type: SegmentType.String, value: '' });
  return result;
}

interface KeyValuePair {
  key: string;
  value: string;
}

function parseEnhancedString(enhanced: string): KeyValuePair[] {
  const result: KeyValuePair[] = [];
  const regex = /(\S+)=(.*?)(?=\s+\S+=|\s*$)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(enhanced)) !== null) {
    result.push({
      key: match[1],
      value: match[2].replace(/~/g, ':').trim(),
    });
  }

  return result;
}
