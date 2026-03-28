#!/usr/bin/env python3
"""
실거래가 기반 시도별 아파트 가격 변동률 계산 → SQLite 저장

방법: 17개 시도의 대표 구에서 실거래 데이터를 가져와
      이번달 vs 지난달 평균가를 비교하여 변동률 산출

실행: python3 scripts/api_sync/sync_price_change.py
"""

import os
import sys
import json
import sqlite3
import time
import logging
import xml.etree.ElementTree as ET
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional
import urllib.request

PROJECT_DIR = Path(__file__).resolve().parent.parent.parent
DB_PATH = PROJECT_DIR / "data" / "realestate.db"
ENV_PATH = PROJECT_DIR / ".env.local"

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("price_change")

API_URL = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev"

# 시도별 대표 법정동코드 (구 단위)
REGION_CODES = {
    "11": {"name": "서울", "codes": ["11680", "11650", "11710"]},  # 강남, 서초, 송파
    "26": {"name": "부산", "codes": ["26350"]},  # 해운대
    "27": {"name": "대구", "codes": ["27260"]},  # 수성
    "28": {"name": "인천", "codes": ["28185"]},  # 연수
    "29": {"name": "광주", "codes": ["29200"]},  # 북구
    "30": {"name": "대전", "codes": ["30170"]},  # 유성
    "31": {"name": "울산", "codes": ["31140"]},  # 남구
    "36": {"name": "세종", "codes": ["36110"]},  # 세종
    "41": {"name": "경기", "codes": ["41135", "41131"]},  # 성남 분당, 수정
    "42": {"name": "강원", "codes": ["42110"]},  # 춘천
    "43": {"name": "충북", "codes": ["43111"]},  # 청주 상당
    "44": {"name": "충남", "codes": ["44133"]},  # 천안 서북
    "45": {"name": "전북", "codes": ["45113"]},  # 전주 덕진
    "46": {"name": "전남", "codes": ["46110"]},  # 목포
    "47": {"name": "경북", "codes": ["47130"]},  # 포항 남구
    "48": {"name": "경남", "codes": ["48170"]},  # 창원 성산
    "50": {"name": "제주", "codes": ["50110"]},  # 제주
}


def load_env():
    env = {}
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                env[key.strip()] = val.strip()
    return env


def fetch_trades(api_key: str, lawd_cd: str, deal_ymd: str) -> list:
    """실거래 API 호출"""
    url = f"{API_URL}?serviceKey={api_key}&LAWD_CD={lawd_cd}&DEAL_YMD={deal_ymd}&numOfRows=1000&pageNo=1"

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = resp.read()

        root = ET.fromstring(data)
        items = root.findall('.//item')

        trades = []
        for item in items:
            amount_text = item.findtext('dealAmount', '').strip().replace(',', '')
            area_text = item.findtext('excluUseAr', '').strip()

            if not amount_text or not area_text:
                continue

            try:
                amount = int(amount_text)
                area = float(area_text)
                if area > 0:
                    trades.append({
                        "amount": amount,
                        "area": area,
                        "price_per_m2": amount / area,
                    })
            except (ValueError, ZeroDivisionError):
                continue

        return trades
    except Exception as e:
        logger.warning(f"API 호출 실패 [{lawd_cd}/{deal_ymd}]: {e}")
        return []


def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS price_changes (
            region_code TEXT NOT NULL,
            region_name TEXT NOT NULL,
            period_type TEXT NOT NULL,
            period_label TEXT NOT NULL,
            trade_type TEXT NOT NULL DEFAULT 'sale',
            change_rate REAL,
            avg_price REAL,
            prev_avg_price REAL,
            trade_count INTEGER,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (region_code, period_type, trade_type)
        )
    """)
    conn.commit()
    return conn


def calculate_change(api_key: str, region_code: str, region_info: dict) -> Optional[dict]:
    """시도별 변동률 계산 (이번달 vs 지난달)"""
    now = datetime.now()
    this_month = now.strftime("%Y%m")

    prev = now.replace(day=1) - timedelta(days=1)
    last_month = prev.strftime("%Y%m")

    this_trades = []
    last_trades = []

    for code in region_info["codes"]:
        this_trades.extend(fetch_trades(api_key, code, this_month))
        time.sleep(0.3)
        last_trades.extend(fetch_trades(api_key, code, last_month))
        time.sleep(0.3)

    if not this_trades or not last_trades:
        logger.warning(f"  {region_info['name']}: 데이터 부족 (이번달 {len(this_trades)}건, 지난달 {len(last_trades)}건)")
        return None

    this_avg = sum(t["price_per_m2"] for t in this_trades) / len(this_trades)
    last_avg = sum(t["price_per_m2"] for t in last_trades) / len(last_trades)

    change_rate = ((this_avg - last_avg) / last_avg) * 100 if last_avg > 0 else 0

    return {
        "region_code": region_code,
        "region_name": region_info["name"],
        "change_rate": round(change_rate, 2),
        "avg_price": round(this_avg * 84, -2),  # 국민평형(84m²) 기준 환산
        "prev_avg_price": round(last_avg * 84, -2),
        "trade_count": len(this_trades),
    }


def main():
    logger.info("=== 시도별 아파트 가격 변동률 계산 시작 ===")

    env = load_env()
    api_key = env.get("PUBLIC_DATA_API_KEY", "")
    if not api_key:
        logger.error("PUBLIC_DATA_API_KEY 없음")
        sys.exit(1)

    conn = get_db()
    now = datetime.now()
    period_label = f"{now.year}년 {now.month}월"

    results = []

    for region_code, region_info in REGION_CODES.items():
        logger.info(f"처리 중: {region_info['name']} ({region_code})")
        result = calculate_change(api_key, region_code, region_info)

        if result:
            conn.execute("""
                INSERT OR REPLACE INTO price_changes
                    (region_code, region_name, period_type, period_label, trade_type,
                     change_rate, avg_price, prev_avg_price, trade_count, updated_at)
                VALUES (?, ?, 'monthly', ?, 'sale', ?, ?, ?, ?, datetime('now'))
            """, (
                result["region_code"],
                result["region_name"],
                period_label,
                result["change_rate"],
                result["avg_price"],
                result["prev_avg_price"],
                result["trade_count"],
            ))
            results.append(result)
            logger.info(f"  → {result['region_name']}: {result['change_rate']:+.2f}% ({result['trade_count']}건)")

    conn.commit()
    conn.close()

    logger.info(f"=== 완료: {len(results)}/{len(REGION_CODES)}개 시도 처리 ===")


if __name__ == "__main__":
    main()
