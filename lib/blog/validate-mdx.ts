import { compileMDX } from 'next-mdx-remote/rsc';
import remarkGfm from 'remark-gfm';
import { preprocessMdxContent } from './preprocessor';
import { mdxComponentNames } from '@/app/blog/components/mdx-components';
import { evalStaticEstree, validateChartProps, UNSTATIC } from './validate-chart-props';

/**
 * MDX 본문 발행 전 검증 게이트.
 *
 * 실제 렌더 경로(app/blog/[slug]/page.tsx)와 동일한 옵션으로 compileMDX 를
 * 시도해 컴파일 가능 여부를 판정한다. 깨진 MDX(미종료 JSX, 잘못된 표현식 등)는
 * compileMDX 가 throw 하므로 이를 잡아 안전한 에러 문자열로 변환한다.
 *
 * 한계(Phase 2 후보):
 * - compile 단계는 *문법* 오류만 잡는다. 미등록 컴포넌트 참조(<Foo/>)는
 *   컴파일은 통과하고 렌더 시에만 실패하므로 여기서는 걸러지지 않는다.
 *
 * 보안: error.message 만 노출. 스택트레이스는 반환하지 않는다.
 */
export type MdxValidationResult =
  | { ok: true }
  | { ok: false; error: string };

export async function validateMdx(content: string): Promise<MdxValidationResult> {
  if (typeof content !== 'string' || content.length === 0) {
    return { ok: false, error: '본문이 비어 있습니다' };
  }

  try {
    await compileMDX({
      source: preprocessMdxContent(content),
      options: {
        // 렌더 경로(app/blog/[slug]/page.tsx)와 동일한 옵션
        blockJS: false,
        mdxOptions: {
          format: 'mdx',
          remarkPlugins: [remarkGfm],
        },
      },
    });
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'MDX 컴파일 실패';
    return { ok: false, error: message };
  }
}

/* ============================================================
 * validateMdxStrict — 문법 + 미등록 컴포넌트 참조까지 검증
 * ============================================================ */

/**
 * 최소 mdast 노드 형태 (JSX 노드 이름·속성 수집용).
 * remark-mdx 가 파싱한 트리에서 mdxJsxFlowElement/mdxJsxTextElement 노드를 본다.
 */
type MdastAttribute = {
  type?: string;
  name?: string;
  value?:
    | string
    | null
    | { type?: string; value?: string; data?: { estree?: unknown } };
};

type MdastNode = {
  type?: string;
  name?: string | null;
  attributes?: MdastAttribute[];
  children?: MdastNode[];
};

/** 수집된 JSX 사용 정보 — 이름 + 정적 평가된 props (spread 사용 시 UNSTATIC) */
type JsxUsage = {
  name: string;
  props: Record<string, unknown> | typeof UNSTATIC;
};

/**
 * 트리를 재귀 순회하며 JSX 요소 이름·속성을 수집하는 remark 플러그인.
 *
 * 실제 렌더(부수효과·성능 우려)를 시도하는 대신, 컴파일 파이프라인에 끼워넣어
 * 파서가 만든 AST 에서 사용된 컴포넌트명과 props 리터럴을 그대로 추출한다.
 * 8-5: props는 estree 정적 평가로 값까지 복원 (리터럴 아닌 표현식은 UNSTATIC).
 */
function collectJsxUsages(sink: JsxUsage[]) {
  return function plugin() {
    return function transformer(tree: MdastNode) {
      walk(tree);
    };
    function walk(node: MdastNode) {
      if (
        node &&
        (node.type === 'mdxJsxFlowElement' ||
          node.type === 'mdxJsxTextElement') &&
        typeof node.name === 'string'
      ) {
        sink.push({ name: node.name, props: extractProps(node.attributes) });
      }
      if (Array.isArray(node?.children)) {
        for (const child of node.children) walk(child);
      }
    }
  };
}

function extractProps(
  attributes: MdastAttribute[] | undefined,
): Record<string, unknown> | typeof UNSTATIC {
  const props: Record<string, unknown> = {};
  for (const attr of attributes ?? []) {
    // spread({...expr}) — 어떤 prop이 들어올지 알 수 없음 → 전체 fail-open
    if (attr.type === 'mdxJsxExpressionAttribute') return UNSTATIC;
    if (attr.type !== 'mdxJsxAttribute' || typeof attr.name !== 'string') continue;

    const v = attr.value;
    if (v === null || v === undefined) {
      props[attr.name] = true; // <Chart autoScale /> 축약형
    } else if (typeof v === 'string') {
      props[attr.name] = v;
    } else if (v.type === 'mdxJsxAttributeValueExpression') {
      props[attr.name] = evalStaticEstree(
        (v.data?.estree ?? null) as Parameters<typeof evalStaticEstree>[0],
      );
    } else {
      props[attr.name] = UNSTATIC;
    }
  }
  return props;
}

/**
 * 발행 전 strict 검증.
 *
 * validateMdx(문법만) 와 달리, 본문이 참조하는 JSX 컴포넌트가
 * 실제 렌더 화이트리스트(mdxComponentNames)에 모두 등록돼 있는지까지 확인한다.
 * 미등록 컴포넌트(<Foo/> 등)는 렌더 시 런타임 에러를 내므로 발행 전에 차단.
 *
 * 판정 규칙: 대문자로 시작하는 JSX 이름만 "컴포넌트"로 간주(소문자는 표준 HTML).
 * 에러 메시지는 어떤 컴포넌트가 미등록인지 알려주되 스택트레이스는 노출하지 않는다.
 */
export async function validateMdxStrict(
  content: string,
): Promise<MdxValidationResult> {
  if (typeof content !== 'string' || content.length === 0) {
    return { ok: false, error: '본문이 비어 있습니다' };
  }

  const usages: JsxUsage[] = [];
  try {
    await compileMDX({
      source: preprocessMdxContent(content),
      options: {
        blockJS: false,
        mdxOptions: {
          format: 'mdx',
          // collectJsxUsages 플러그인을 끼워 컴파일 중 컴포넌트명·props 수집
          remarkPlugins: [remarkGfm, collectJsxUsages(usages)],
        },
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'MDX 컴파일 실패';
    return { ok: false, error: message };
  }

  const allowed = new Set(mdxComponentNames);
  // 대문자로 시작 = 컴포넌트 / 멤버표현식(Foo.Bar 포함) → 화이트리스트 대조
  const unknown = [
    ...new Set(usages.map((u) => u.name)),
  ].filter((name) => /^[A-Z]/.test(name) && !allowed.has(name));

  if (unknown.length > 0) {
    return {
      ok: false,
      error: `미등록 컴포넌트 참조: ${unknown.join(', ')}`,
    };
  }

  // ─── 8-5: 차트 required props 검증 (가드 8-1 기준의 발행 전 차단) ───
  const propErrors: string[] = [];
  for (const usage of usages) {
    const err = validateChartProps(usage.name, usage.props);
    if (err) propErrors.push(err);
  }
  if (propErrors.length > 0) {
    // 중복 제거 후 최대 3건까지 안내 (텔레그램 메시지 가독성)
    const uniq = [...new Set(propErrors)];
    return {
      ok: false,
      error: `차트 props 오류: ${uniq.slice(0, 3).join(' / ')}${uniq.length > 3 ? ` 외 ${uniq.length - 3}건` : ''}`,
    };
  }

  return { ok: true };
}
