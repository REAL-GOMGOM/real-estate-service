/**
 * 한국 17개 시도 SVG 경로 데이터
 * 간략화된 경로로 시도별 영역 표현
 * viewBox: "0 0 800 1000"
 */

export interface RegionPath {
  code: string;
  name: string;
  path: string;
  labelX: number;
  labelY: number;
}

export const KOREA_REGIONS: RegionPath[] = [
  {
    code: '11', name: '서울',
    path: 'M330,340 L350,330 L370,335 L375,350 L365,365 L345,368 L330,360 Z',
    labelX: 352, labelY: 350,
  },
  {
    code: '26', name: '부산',
    path: 'M530,720 L560,710 L580,720 L585,745 L570,760 L545,755 L530,740 Z',
    labelX: 558, labelY: 738,
  },
  {
    code: '27', name: '대구',
    path: 'M490,610 L520,600 L545,610 L548,635 L530,650 L505,645 L490,630 Z',
    labelX: 520, labelY: 625,
  },
  {
    code: '28', name: '인천',
    path: 'M290,340 L310,330 L325,340 L325,360 L310,370 L290,365 Z',
    labelX: 308, labelY: 352,
  },
  {
    code: '29', name: '광주',
    path: 'M310,700 L335,690 L355,700 L355,720 L338,730 L315,725 Z',
    labelX: 333, labelY: 712,
  },
  {
    code: '30', name: '대전',
    path: 'M380,520 L405,510 L425,520 L425,540 L408,550 L385,545 Z',
    labelX: 403, labelY: 530,
  },
  {
    code: '31', name: '울산',
    path: 'M560,650 L585,640 L600,650 L600,675 L585,685 L560,678 Z',
    labelX: 580, labelY: 665,
  },
  {
    code: '36', name: '세종',
    path: 'M370,500 L385,495 L395,505 L392,518 L380,522 L370,515 Z',
    labelX: 383, labelY: 510,
  },
  {
    code: '41', name: '경기',
    path: 'M280,280 L340,260 L400,275 L410,310 L400,370 L380,390 L340,395 L300,385 L275,355 L265,310 Z',
    labelX: 345, labelY: 310,
  },
  {
    code: '42', name: '강원',
    path: 'M400,230 L470,210 L540,230 L560,290 L540,370 L500,400 L440,390 L410,360 L400,300 Z',
    labelX: 480, labelY: 310,
  },
  {
    code: '43', name: '충북',
    path: 'M390,400 L440,390 L475,405 L480,450 L460,490 L420,500 L390,485 L380,440 Z',
    labelX: 435, labelY: 450,
  },
  {
    code: '44', name: '충남',
    path: 'M270,420 L330,400 L380,420 L385,470 L370,520 L320,540 L280,520 L260,475 Z',
    labelX: 325, labelY: 470,
  },
  {
    code: '45', name: '전북',
    path: 'M280,550 L340,540 L395,555 L400,600 L380,640 L330,650 L285,635 L270,590 Z',
    labelX: 338, labelY: 595,
  },
  {
    code: '46', name: '전남',
    path: 'M260,660 L320,650 L370,660 L385,710 L370,770 L310,790 L260,770 L245,720 Z',
    labelX: 318, labelY: 720,
  },
  {
    code: '47', name: '경북',
    path: 'M460,480 L530,460 L590,480 L600,540 L580,610 L530,630 L480,615 L455,560 Z',
    labelX: 530, labelY: 550,
  },
  {
    code: '48', name: '경남',
    path: 'M400,650 L460,640 L530,655 L545,700 L530,750 L470,765 L420,750 L395,700 Z',
    labelX: 470, labelY: 700,
  },
  {
    code: '50', name: '제주',
    path: 'M300,880 L340,870 L380,880 L385,905 L365,920 L325,920 L300,905 Z',
    labelX: 343, labelY: 898,
  },
];
