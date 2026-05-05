/**
 * MDX/markdown 본문 server-side preprocessing
 *
 * markdown은 raw HTML block 안에 빈 줄을 만나면 block 종료 (CommonMark 규칙).
 * 다중 element 컨테이너(<svg>...</svg> 등)에서 자식 element가 컨테이너 밖으로 빠지는 문제 발생.
 *
 * 본 함수는 발행·preview 렌더 직전에 호출되어 SVG 영역의 빈 줄만 단일 줄바꿈으로 정규화.
 * 본문 다른 영역은 손대지 않음 (markdown paragraph 동작 보존).
 */
export function preprocessMdxContent(content: string): string {
  if (!content) return content;

  // <svg>...</svg> 블록 매칭 — non-greedy, 대소문자 무관
  // \b 사용으로 <svgfoo> 같은 false match 방지
  return content.replace(
    /<svg\b[\s\S]*?<\/svg>/gi,
    (svgBlock) => {
      // 블록 안의 빈 줄(공백/탭만 있는 줄 포함)을 단일 줄바꿈으로
      return svgBlock.replace(/\n[ \t]*\n/g, '\n');
    },
  );
}
