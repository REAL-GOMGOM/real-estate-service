import Anthropic from '@anthropic-ai/sdk';
import type { Report, ReportCommentary } from './types';

const SYSTEM_PROMPT = `너는 부동산 데이터 분석 전문가야. 수도권 아파트 실거래 데이터를 받아서 간결한 시장 코멘터리를 작성해.

규칙:
- 반드시 JSON으로만 응답해. 다른 텍스트 없이.
- 형식: { "pullquote": "한 줄 핵심 요약 (50자 이내)", "paragraphs": ["본문1", "본문2"] }
- pullquote는 최근 한 달의 시장 분위기를 한 문장으로 요약하는 톤으로.
- paragraphs는 2~3개, 각 50~100자
- "추천", "매수하세요", "투자하세요" 등 투자 권유 표현 절대 금지
- "참고 정보", "~로 나타났습니다", "~한 흐름입니다" 같은 중립적 표현 사용
- 숫자는 "억", "만원" 등 한국식 단위 사용
- summary.avgPrice와 byRegion[i].avgPrice는 이미 계산된 값입니다. 그대로 인용하고 직접 계산하지 마세요.
- 데이터에 없는 단지명, 면적, 가격을 추측하거나 만들지 마세요.
- 단, 데이터에 있는 사실들 사이의 패턴, 흐름, 비교, 해석은 적극적으로 표현해도 좋습니다. 흥미롭고 통찰력 있는 분석이 목표입니다.
- 분석 기간은 최근 30일입니다. "이번 주"가 아니라 "최근 30일" 또는 "지난 한 달"로 표현하세요.
- 데이터는 국토부에 신고 완료된 거래만 포함합니다. 실제 거래는 신고까지 최대 30일이 걸리므로, 이 표본도 일부는 누락될 수 있다는 점을 인지하되, 코멘트에서 직접 면책을 반복할 필요는 없습니다.
- paragraphs는 2~3개. 시도별 흐름, 주목할 단지, 거래 특징 중에서 가장 흥미로운 것을 골라 풍부하게 서술하세요.
- 30일 표본이라 시도별 차이, 거래 집중 지역, 가격대 분포 같은 더 구조적인 분석이 가능합니다.`;

function extractJSON(raw: string): unknown {
  let cleaned = raw.replace(/```json\s*|\s*```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  cleaned = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function isValidCommentary(v: unknown): v is ReportCommentary {
  if (!v || typeof v !== 'object') return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.pullquote === 'string' &&
    Array.isArray(obj.paragraphs) &&
    obj.paragraphs.length > 0 &&
    obj.paragraphs.every((p: unknown) => typeof p === 'string')
  );
}

export async function generateCommentary(report: Report): Promise<ReportCommentary | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[commentary] ANTHROPIC_API_KEY 미설정');
    return null;
  }

  const compactData = {
    dateRange: report.dateRange,
    summary: report.summary,
    byRegion: report.byRegion,
    topYearHighs: report.topYearHighs.slice(0, 5),
  };

  const userPrompt = `다음 수도권 부동산 실거래 데이터를 분석해줘:\n\n${JSON.stringify(compactData, null, 2)}\n\n위 데이터를 바탕으로 JSON으로만 응답해.`;

  const client = new Anthropic({ apiKey });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await client.messages.create(
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      },
      { signal: controller.signal },
    );

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') return null;

    const rawText = textBlock.text;
    const parsed = extractJSON(rawText);
    if (!isValidCommentary(parsed)) {
      console.error('[commentary] 응답 파싱 실패:', rawText.slice(0, 200));
      return null;
    }

    return parsed;
  } catch (e) {
    console.error('[commentary] failed:', e);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
