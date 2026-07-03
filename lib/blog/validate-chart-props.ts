/**
 * 백로그 8-5: 발행 게이트 차트 props 검증.
 *
 * validateMdxStrict(컴포넌트명 화이트리스트)에 이어, 차트 12종의 required props
 * 존재·기본 타입을 발행 전에 검사한다. 목적은 "형식이 틀려 placeholder로 렌더될 글"을
 * 발행 전에 422로 돌려보내는 것 (컴포넌트 가드 8-1과 동일 기준의 사전 차단).
 *
 * 설계 원칙:
 * - 보수 검증: required 누락·명백한 타입 불일치만 실패. 기존 발행 글 회귀 0.
 * - fail-open: JSX attribute가 정적 리터럴이 아니면(변수·연산식 등) 해당 값 검증을
 *   건너뛴다. spread({...props}) 사용 시 그 컴포넌트는 통째로 건너뛴다.
 * - 검사 기준은 docs/chart-usage-guide.md 의 Required 명세와 8-1 가드 조건.
 */

/** 정적 평가 불가 marker */
export const UNSTATIC = Symbol('unstatic');
type Evaluated = unknown | typeof UNSTATIC;

type EstreeNode = {
  type: string;
  // 사용하는 필드들만 느슨하게
  body?: EstreeNode[];
  expression?: EstreeNode;
  elements?: (EstreeNode | null)[];
  properties?: EstreeNode[];
  key?: EstreeNode;
  value?: unknown;
  argument?: EstreeNode;
  operator?: string;
  name?: string;
  quasis?: { value?: { cooked?: string } }[];
  expressions?: EstreeNode[];
  computed?: boolean;
  raw?: string;
};

/**
 * estree 리터럴 표현식 정적 평가.
 * 허용: 리터럴, 배열/객체 리터럴, 단항 +/-, 표현식 없는 템플릿 문자열, undefined/null.
 * 그 외(식별자, 호출, 연산 등) → UNSTATIC.
 */
export function evalStaticEstree(node: EstreeNode | undefined | null): Evaluated {
  if (!node) return UNSTATIC;

  switch (node.type) {
    case 'Program': {
      const stmt = node.body?.[0];
      if (!stmt || stmt.type !== 'ExpressionStatement') return UNSTATIC;
      return evalStaticEstree(stmt.expression);
    }
    case 'ExpressionStatement':
      return evalStaticEstree(node.expression);
    case 'Literal':
      return node.value;
    case 'TemplateLiteral': {
      if ((node.expressions?.length ?? 0) > 0) return UNSTATIC;
      return node.quasis?.map((q) => q.value?.cooked ?? '').join('') ?? UNSTATIC;
    }
    case 'UnaryExpression': {
      const v = evalStaticEstree(node.argument);
      if (v === UNSTATIC || typeof v !== 'number') return UNSTATIC;
      if (node.operator === '-') return -v;
      if (node.operator === '+') return v;
      return UNSTATIC;
    }
    case 'ArrayExpression': {
      const out: Evaluated[] = [];
      for (const el of node.elements ?? []) {
        if (el === null) { out.push(undefined); continue; }
        if (el.type === 'SpreadElement') return UNSTATIC;
        out.push(evalStaticEstree(el));
      }
      return out;
    }
    case 'ObjectExpression': {
      const obj: Record<string, Evaluated> = {};
      for (const prop of node.properties ?? []) {
        if (prop.type !== 'Property' || prop.computed) return UNSTATIC;
        const keyNode = prop.key as EstreeNode | undefined;
        const key =
          keyNode?.type === 'Identifier' ? keyNode.name
          : keyNode?.type === 'Literal' ? String(keyNode.value)
          : null;
        if (!key) return UNSTATIC;
        obj[key] = evalStaticEstree(prop.value as EstreeNode);
      }
      return obj;
    }
    case 'Identifier':
      if (node.name === 'undefined') return undefined;
      return UNSTATIC;
    default:
      return UNSTATIC;
  }
}

// ─── 타입 술어 (UNSTATIC은 "검증 통과" 취급 — fail-open) ───
const pass = (v: Evaluated) => v === UNSTATIC;
const isStr = (v: Evaluated) => pass(v) || typeof v === 'string';
const isNum = (v: Evaluated) => pass(v) || (typeof v === 'number' && Number.isFinite(v));
const isNumOrNull = (v: Evaluated) => pass(v) || v === null || (typeof v === 'number' && Number.isFinite(v));
const isStrOrNum = (v: Evaluated) => pass(v) || typeof v === 'string' || typeof v === 'number';
const isArr = (v: Evaluated): v is Evaluated[] => Array.isArray(v);

type Props = Record<string, Evaluated>;
type Rule = (props: Props, name: string) => string | null;

function requireProp(props: Props, name: string, key: string): string | null {
  if (!(key in props)) return `${name}: 필수 prop '${key}' 누락`;
  return null;
}

/** 배열 required prop 공통 검사: 존재 + 배열 타입. UNSTATIC이면 통과. */
function requireArray(props: Props, name: string, key: string): string | null | Evaluated[] {
  const missing = requireProp(props, name, key);
  if (missing) return missing;
  const v = props[key];
  if (pass(v)) return null; // 정적 평가 불가 → 검증 skip
  if (!isArr(v)) return `${name}: '${key}'는 배열이어야 합니다`;
  return v;
}

/** 시리즈형(LineChart·AreaChart) 공통 규칙 */
function seriesRule(props: Props, name: string): string | null {
  const t = requireProp(props, name, 'title');
  if (t) return t;
  const series = requireArray(props, name, 'series');
  if (typeof series === 'string') return series;
  if (!series) return null;
  for (let i = 0; i < series.length; i++) {
    const s = series[i];
    if (pass(s)) continue;
    if (typeof s !== 'object' || s === null || Array.isArray(s)) {
      return `${name}: series[${i}]는 객체여야 합니다`;
    }
    const so = s as Props;
    if (!('name' in so)) return `${name}: series[${i}].name 누락`;
    if (!('data' in so)) return `${name}: series[${i}].data 누락`;
    const data = so.data;
    if (pass(data)) continue;
    if (!isArr(data)) return `${name}: series[${i}].data는 배열이어야 합니다`;
    for (let j = 0; j < data.length; j++) {
      const p = data[j];
      if (pass(p)) continue;
      const po = p as Props;
      if (typeof p !== 'object' || p === null) return `${name}: series[${i}].data[${j}]는 {x, y} 객체여야 합니다`;
      if (!isStrOrNum(po.x)) return `${name}: series[${i}].data[${j}].x는 문자열 또는 숫자여야 합니다`;
      if (!isNum(po.y)) return `${name}: series[${i}].data[${j}].y는 숫자여야 합니다`;
    }
  }
  return null;
}

/** 라벨-값 배열형(HorizontalBarChart·DonutChart) 공통 규칙 */
function labelValueRule(props: Props, name: string): string | null {
  const t = requireProp(props, name, 'title');
  if (t) return t;
  const data = requireArray(props, name, 'data');
  if (typeof data === 'string') return data;
  if (!data) return null;
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (pass(row)) continue;
    if (typeof row !== 'object' || row === null) return `${name}: data[${i}]는 {label, value} 객체여야 합니다`;
    const ro = row as Props;
    if (!isStr(ro.label) || !('label' in ro)) return `${name}: data[${i}].label(문자열) 필요`;
    if (!isNum(ro.value) || !('value' in ro)) return `${name}: data[${i}].value(숫자) 필요`;
  }
  return null;
}

export const CHART_PROP_RULES: Record<string, Rule> = {
  LineChart: seriesRule,
  AreaChart: seriesRule,
  HorizontalBarChart: labelValueRule,
  DonutChart: labelValueRule,

  StackedBarChart: (props, name) => {
    // title은 이 차트만 optional
    const bars = requireArray(props, name, 'bars');
    if (typeof bars === 'string') return bars;
    if (!bars) return null;
    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i];
      if (pass(bar)) continue;
      if (typeof bar !== 'object' || bar === null) return `${name}: bars[${i}]는 객체여야 합니다`;
      const bo = bar as Props;
      if (!('label' in bo)) return `${name}: bars[${i}].label 누락`;
      if (!('segments' in bo)) return `${name}: bars[${i}].segments 누락`;
      const segs = bo.segments;
      if (pass(segs)) continue;
      if (!isArr(segs)) return `${name}: bars[${i}].segments는 배열이어야 합니다`;
      for (let j = 0; j < segs.length; j++) {
        const seg = segs[j];
        if (pass(seg)) continue;
        const so = seg as Props;
        if (typeof seg !== 'object' || seg === null || !isNum(so.value) || !('value' in so)) {
          return `${name}: bars[${i}].segments[${j}].value(숫자) 필요`;
        }
      }
    }
    return null;
  },

  ScatterPlot: (props, name) => {
    const t = requireProp(props, name, 'title');
    if (t) return t;
    const groups = requireArray(props, name, 'groups');
    if (typeof groups === 'string') return groups;
    if (!groups) return null;
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      if (pass(g)) continue;
      if (typeof g !== 'object' || g === null) return `${name}: groups[${i}]는 객체여야 합니다`;
      const go = g as Props;
      if (!('name' in go)) return `${name}: groups[${i}].name 누락`;
      if (!('dots' in go)) return `${name}: groups[${i}].dots 누락`;
      const dots = go.dots;
      if (pass(dots)) continue;
      if (!isArr(dots)) return `${name}: groups[${i}].dots는 배열이어야 합니다`;
      for (let j = 0; j < dots.length; j++) {
        const d = dots[j];
        if (pass(d)) continue;
        const dobj = d as Props;
        if (typeof d !== 'object' || d === null || !isNum(dobj.x) || !isNum(dobj.y)) {
          return `${name}: groups[${i}].dots[${j}]의 x·y는 모두 숫자여야 합니다`;
        }
      }
    }
    return null;
  },

  SparkLine: (props, name) => {
    const a = requireProp(props, name, 'ariaLabel');
    if (a) return a;
    const data = requireArray(props, name, 'data');
    if (typeof data === 'string') return data;
    if (!data) return null;
    for (let i = 0; i < data.length; i++) {
      if (!isNum(data[i])) return `${name}: data[${i}]는 숫자여야 합니다`;
    }
    return null;
  },

  RangeBarChart: (props, name) => {
    const t = requireProp(props, name, 'title');
    if (t) return t;
    const items = requireArray(props, name, 'items');
    if (typeof items === 'string') return items;
    if (!items) return null;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (pass(item)) continue;
      if (typeof item !== 'object' || item === null) return `${name}: items[${i}]는 객체여야 합니다`;
      const io = item as Props;
      if (!('label' in io)) return `${name}: items[${i}].label 누락`;
      if (!isNum(io.min) || !('min' in io)) return `${name}: items[${i}].min(숫자) 필요`;
      if (!isNum(io.max) || !('max' in io)) return `${name}: items[${i}].max(숫자) 필요`;
    }
    return null;
  },

  GaugeChart: (props, name) => {
    const t = requireProp(props, name, 'title');
    if (t) return t;
    const v = requireProp(props, name, 'value');
    if (v) return v;
    if (!isNum(props.value)) return `${name}: value는 유한한 숫자여야 합니다`;
    return null;
  },

  HeatMap: (props, name) => {
    const t = requireProp(props, name, 'title');
    if (t) return t;
    for (const key of ['rows', 'cols'] as const) {
      const arr = requireArray(props, name, key);
      if (typeof arr === 'string') return arr;
    }
    const values = requireArray(props, name, 'values');
    if (typeof values === 'string') return values;
    if (!values) return null;
    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      if (pass(row)) continue;
      if (!isArr(row)) return `${name}: values[${i}]는 배열이어야 합니다 (2차원 배열 필요)`;
      for (let j = 0; j < row.length; j++) {
        if (!isNumOrNull(row[j])) return `${name}: values[${i}][${j}]는 숫자 또는 null이어야 합니다`;
      }
    }
    return null;
  },

  DemographicShiftBars: (props, name) => {
    const t = requireProp(props, name, 'title');
    if (t) return t;
    for (const key of ['leftHeader', 'rightHeader'] as const) {
      const missing = requireProp(props, name, key);
      if (missing) return missing;
      const h = props[key];
      if (pass(h)) continue;
      if (typeof h !== 'object' || h === null || Array.isArray(h)) return `${name}: ${key}는 {label, subLabel} 객체여야 합니다`;
      const ho = h as Props;
      if (!('label' in ho) || !('subLabel' in ho)) return `${name}: ${key}에 label·subLabel 필요`;
    }
    const cats = requireArray(props, name, 'categories');
    if (typeof cats === 'string') return cats;
    if (!cats) return null;
    const allowedColors = new Set(['yellow', 'amberOrange', 'red']);
    for (let i = 0; i < cats.length; i++) {
      const c = cats[i];
      if (pass(c)) continue;
      if (typeof c !== 'object' || c === null) return `${name}: categories[${i}]는 객체여야 합니다`;
      const co = c as Props;
      if (!('label' in co)) return `${name}: categories[${i}].label 누락`;
      if (!isNum(co.leftValue) || !('leftValue' in co)) return `${name}: categories[${i}].leftValue(숫자) 필요`;
      if (!isNum(co.rightValue) || !('rightValue' in co)) return `${name}: categories[${i}].rightValue(숫자) 필요`;
      if (!('color' in co)) return `${name}: categories[${i}].color 누락 (yellow·amberOrange·red 중 택1)`;
      const col = co.color;
      if (!pass(col) && (typeof col !== 'string' || !allowedColors.has(col))) {
        return `${name}: categories[${i}].color는 yellow·amberOrange·red만 허용`;
      }
    }
    return null;
  },

  AgeGroupBars: (props, name) => {
    for (const key of ['title', 'beforeLabel', 'afterLabel'] as const) {
      const missing = requireProp(props, name, key);
      if (missing) return missing;
    }
    const groups = requireArray(props, name, 'groups');
    if (typeof groups === 'string') return groups;
    return null;
  },
};

/**
 * 단일 차트 컴포넌트의 props 검증.
 * @returns 오류 메시지 (통과·비대상 컴포넌트·spread 사용 시 null)
 */
export function validateChartProps(
  componentName: string,
  props: Props | typeof UNSTATIC,
): string | null {
  const rule = CHART_PROP_RULES[componentName];
  if (!rule) return null;          // 차트가 아닌 컴포넌트 — 비대상
  if (props === UNSTATIC) return null; // spread 등 — 전체 skip (fail-open)
  return rule(props, componentName);
}
