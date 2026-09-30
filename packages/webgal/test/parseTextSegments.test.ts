import { describe, expect, it } from 'vitest';
import { parseTextSegments, SegmentType } from '../src/Stage/TextBox/parseTextSegments';
import useEscape from '../src/hooks/useEscape';
import SceneParser from '../../parser/src/index';
import { ADD_NEXT_ARG_LIST, SCRIPT_CONFIG } from '../../parser/src/config/scriptConfig';

const plain = (value: string) => ({ type: SegmentType.String, value });
const rich = (text: string, values: { key: string; value: string }[], ruby = '') => ({
  type: SegmentType.Link,
  value: { text, ruby, values },
});

describe('parseTextSegments', () => {
  it('keeps the full CSS and surrounding text from issue #1036 after script unescaping', () => {
    const text = String.raw`Normal Word→[Rotate test](style-alltext=display:inline-block\; transform:rotate(-8deg)\; transform-origin:center\;)←Normal Word`;

    expect(parseTextSegments(useEscape(text))).toEqual([
      plain(''),
      plain('Normal Word→'),
      rich('Rotate test', [
        { key: 'style-alltext', value: 'display:inline-block; transform:rotate(-8deg); transform-origin:center;' },
      ]),
      plain('←Normal Word'),
    ]);
  });

  it('parses the original issue script through the scene parser', () => {
    const parser = new SceneParser(undefined, (fileName) => fileName, ADD_NEXT_ARG_LIST, SCRIPT_CONFIG);
    const script = String.raw`WebGAL: Normal Word→[Rotate test](style-alltext=display:inline-block\; transform:rotate(-8deg)\; transform-origin:center\;)←Normal Word;`;
    const scene = parser.parse(script, 'rich-text', 'rich-text.txt');
    expect(scene.sentenceList).toHaveLength(1);
    expect(parseTextSegments(useEscape(scene.sentenceList[0].content))).toEqual([
      plain(''),
      plain('Normal Word→'),
      rich('Rotate test', [
        { key: 'style-alltext', value: 'display:inline-block; transform:rotate(-8deg); transform-origin:center;' },
      ]),
      plain('←Normal Word'),
    ]);
  });

  it.each([
    'transform:rotate(-8deg); transform-origin:center;',
    'color:rgba(255, 128, 64, 0.5);',
    'transform:scale(1.2);',
    'transform:skewX(15deg);',
    'transform:rotate(-8deg) scale(1.2) skewX(15deg);',
    'width:calc(100% - var(--spacing, 10px));',
    'color:rgba(var(--rgb, 255, 0, 0), 0.5);',
    'color:red/* ) */; transform:rotate(5deg);',
    'color:red/* ( */; transform:rotate(5deg);',
    'font-family:var(--font,/**/"A)B"); color:red;',
  ])('preserves CSS functions: %s', (css) => {
    expect(parseTextSegments(`before [text](style=${css}) after`)).toEqual([
      plain(''),
      plain('before '),
      rich('text', [{ key: 'style', value: css }]),
      plain(' after'),
    ]);
  });

  it.each([
    'font-family:"Closing ) Parenthesis"; color:red;',
    "font-family:'Opening ( Parenthesis'; color:red;",
    'background-image:url("image).png"); color:red;',
    String.raw`font-family:"Escaped \" ) Quote"; color:red;`,
    String.raw`font-family:'Escaped \' ( Quote'; color:red;`,
    String.raw`background-image:url(image\)name.png); color:red;`,
    String.raw`background-image:url(image\(name.png); color:red;`,
  ])('ignores quoted or escaped parentheses: %s', (css) => {
    expect(parseTextSegments(`[text](style-alltext=${css})tail`)).toEqual([
      plain(''),
      rich('text', [{ key: 'style-alltext', value: css }]),
      plain('tail'),
    ]);
  });

  it('supports quoted strings in legacy tilde CSS syntax', () => {
    expect(parseTextSegments('[text](style=font-family~"A)B"; color~red;)tail')).toEqual([
      plain(''),
      rich('text', [{ key: 'style', value: 'font-family:"A)B"; color:red;' }]),
      plain('tail'),
    ]);
  });

  it('recognizes a closing parenthesis after an escaped backslash', () => {
    const css = String.raw`font-family:Example\\`;
    expect(parseTextSegments(`[text](style=${css})tail`)).toEqual([
      plain(''),
      rich('text', [{ key: 'style', value: css }]),
      plain('tail'),
    ]);
  });

  it('keeps legacy shorthand ruby and the leading empty node', () => {
    expect(parseTextSegments('[漢字](かんじ)')).toEqual([plain(''), rich('漢字', [], 'かんじ')]);
  });

  it('keeps legacy attributes, ruby and tilde-to-colon conversion', () => {
    expect(parseTextSegments('[漢字](style=color~red ruby=かんじ tips=hint)')).toEqual([
      plain(''),
      rich(
        '漢字',
        [
          { key: 'style', value: 'color:red' },
          { key: 'ruby', value: 'かんじ' },
          { key: 'tips', value: 'hint' },
        ],
        'かんじ',
      ),
    ]);
  });

  it('keeps apostrophes in shorthand ruby and bare attribute values', () => {
    expect(parseTextSegments("[word](it's)[word](tips=don't)!")).toEqual([
      plain(''),
      rich('word', [], "it's"),
      rich('word', [{ key: 'tips', value: "don't" }]),
      plain('!'),
    ]);
  });

  it('treats leading apostrophes as literal ruby and tips text', () => {
    expect(parseTextSegments("[word]('tis)[word](tips='tis)[ok](reading)")).toEqual([
      plain(''),
      rich('word', [], "'tis"),
      rich('word', [{ key: 'tips', value: "'tis" }]),
      rich('ok', [], 'reading'),
    ]);
  });

  it('does not apply CSS quote handling to a following tips attribute', () => {
    expect(parseTextSegments("[text](style=transform:rotate(5deg); tips='tis)")).toEqual([
      plain(''),
      rich('text', [
        { key: 'style', value: 'transform:rotate(5deg);' },
        { key: 'tips', value: "'tis" },
      ]),
    ]);
  });

  it('parses adjacent spans without swallowing the next span or extra closing parentheses', () => {
    expect(parseTextSegments('[one](style=transform:rotate(-8deg);)[two](style=color:rgba(0,0,0,0.5);))')).toEqual([
      plain(''),
      rich('one', [{ key: 'style', value: 'transform:rotate(-8deg);' }]),
      rich('two', [{ key: 'style', value: 'color:rgba(0,0,0,0.5);' }]),
      plain(')'),
    ]);
  });

  it.each([
    'plain text 😀 中文\nsecond line',
    'ordinary [brackets] and (parentheses)',
    '[',
    '[text]',
    '[text](',
    '[text]()',
    '[](style=color:red)',
    '[text](style=transform:rotate(-8deg)',
    '[text](style=font-family:"Unclosed)',
    '[text](style=color:red/* unclosed)',
    String.raw`[text](style=color:red\)`,
  ])('preserves ordinary or incomplete text: %s', (text) => {
    expect(parseTextSegments(text)).toEqual([plain(''), plain(text)]);
  });

  it('preserves incomplete markup after a complete span', () => {
    const tail = '[broken](style=rotate(-8deg)';
    expect(parseTextSegments(`[ok](ruby=reading)${tail}`)).toEqual([
      plain(''),
      rich('ok', [{ key: 'ruby', value: 'reading' }], 'reading'),
      plain(tail),
    ]);
  });

  it('does not lose empty markup before a complete span', () => {
    expect(parseTextSegments('[empty]()[ok](reading)')).toEqual([
      plain(''),
      plain('[empty]()'),
      rich('ok', [], 'reading'),
    ]);
  });

  it('preserves a long run of unmatched brackets', () => {
    const text = '['.repeat(40000);
    expect(parseTextSegments(text)).toEqual([plain(''), plain(text)]);
  });

  it('keeps empty input compatible', () => {
    expect(parseTextSegments('')).toEqual([plain('')]);
  });
});
