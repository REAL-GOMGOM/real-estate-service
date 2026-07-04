/**
 * 백로그 8-5: 발행 게이트 차트 props 검증 테스트.
 *
 * validateMdxStrict E2E — 실제 MDX 파싱 산출 estree를 그대로 검증 경로에 태운다.
 * 기준: 가이드 Required 명세·8-1 가드 조건. 기존 발행 글 호환(회귀 0)이 최우선.
 */
import { describe, it, expect } from 'vitest';
import { validateMdxStrict } from '../validate-mdx';

const ok = async (mdx: string) => {
  const r = await validateMdxStrict(mdx);
  expect(r).toEqual({ ok: true });
};

const fail = async (mdx: string, includes: string) => {
  const r = await validateMdxStrict(mdx);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error).toContain(includes);
};

describe('정상 케이스 — 가이드 최소 예시 통과 (기존 글 호환)', () => {
  it('LineChart 정상 series', () =>
    ok(`<LineChart title="추이" unit="만원" series={[
      { name: '강남', data: [{ x: '2022', y: 7800 }, { x: '2023', y: 8200 }] }
    ]} />`));

  it('HorizontalBarChart 정상 data + autoScale 축약형', () =>
    ok(`<HorizontalBarChart title="용적률 (%)" unit="%" autoScale data={[
      { label: '변경 전', value: 248.25, color: "gray" },
      { label: '변경 후', value: 273.65, color: "red" }
    ]} />`));

  it('GaugeChart 정상 + 음수 리터럴', () =>
    ok(`<GaugeChart title="전세가율" value={58.2} min={-10} />`));

  it('HeatMap 정상 (null 셀 포함 2차원)', () =>
    ok(`<HeatMap title="지역×분기" rows={["1분기","2분기"]} cols={["북","남"]} values={[[2.5, null], [1.8, -0.5]]} />`));

  it('SparkLine 정상', () =>
    ok(`<SparkLine data={[10, 20, 15]} ariaLabel="추세" />`));

  it('일반 마크다운 + GFM 표 + 푸터 링크 (차트 없음)', () =>
    ok(`# 제목\n\n본문 **강조**\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n---\n\n[내집 텔레그램 채널 바로가기](https://t.me/realMyzip)`));
});

describe('fail-open — 정적 평가 불가 값은 검증 skip', () => {
  it('식별자 참조 series → 통과 (리터럴 아님)', () =>
    ok(`export const s = [{ name: 'A', data: [{ x: 1, y: 2 }] }];\n\n<LineChart title="t" series={s} />`));

  it('spread props → 통과 (전체 skip)', () =>
    ok(`export const p = { title: 't', value: 50 };\n\n<GaugeChart {...p} />`));
});

describe('오류 차단 — 8-1 가드로 placeholder가 될 글을 발행 전에 422', () => {
  it('LineChart: series 누락 (실사고 케이스 — data로 오기)', () =>
    fail(`<LineChart title="t" unit="%" data={[{ label: '2월' }]} />`, "series"));

  it('LineChart: series가 객체 (배열 아님)', () =>
    fail(`<LineChart title="t" series={{ name: 'A' }} />`, '배열'));

  it('LineChart: data point y가 문자열', () =>
    fail(`<LineChart title="t" series={[{ name: 'A', data: [{ x: '1월', y: "10" }] }]} />`, 'y는 숫자'));

  it('HorizontalBarChart: value 문자열', () =>
    fail(`<HorizontalBarChart title="t" data={[{ label: '강남', value: "24%" }]} />`, 'value(숫자)'));

  it('StackedBarChart: segments 누락', () =>
    fail(`<StackedBarChart bars={[{ label: 'Q1' }]} />`, 'segments'));

  it('GaugeChart: value 누락', () =>
    fail(`<GaugeChart title="t" />`, "value"));

  it('GaugeChart: value 문자열', () =>
    fail(`<GaugeChart title="t" value={"50"} />`, '숫자'));

  it('HeatMap: values 누락', () =>
    fail(`<HeatMap title="t" rows={["r"]} cols={["c"]} />`, "values"));

  it('HeatMap: values가 1차원', () =>
    fail(`<HeatMap title="t" rows={["r"]} cols={["c"]} values={[1, 2]} />`, '2차원'));

  it('SparkLine: ariaLabel 누락', () =>
    fail(`<SparkLine data={[1, 2, 3]} />`, 'ariaLabel'));

  it('DemographicShiftBars: 허용 외 color', () =>
    fail(`<DemographicShiftBars title="t" leftHeader={{ label: 'L', subLabel: 'l' }} rightHeader={{ label: 'R', subLabel: 'r' }} categories={[{ label: '10대', leftValue: 1, rightValue: 2, color: "blue" }]} />`, 'yellow·amberOrange·red'));

  it('ScatterPlot: dot 좌표가 문자열', () =>
    fail(`<ScatterPlot title="t" groups={[{ name: 'A', dots: [{ x: "1", y: 2 }] }]} />`, '숫자'));

  it('RangeBarChart: min 누락', () =>
    fail(`<RangeBarChart title="t" items={[{ label: 'A', max: 10 }]} />`, 'min'));
});
