#!/usr/bin/env python3
"""
R-ONE 부동산통계정보 매매가격지수 → SQLite 저장

STATBL_ID: A_2024_00050 (월간 매매가격지수_아파트)
변동률 = (이번달 지수 - 지난달 지수) / 지난달 지수 × 100

실행: python3 scripts/api_sync/sync_rone_index.py
"""

import json
import sqlite3
import logging
import urllib.request
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict

PROJECT_DIR = Path(__file__).resolve().parent.parent.parent
DB_PATH = PROJECT_DIR / "data" / "realestate.db"
ENV_PATH = PROJECT_DIR / ".env.local"

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("rone_index")

BASE_URL = "https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do"

# CLS_NM → region_code 매핑
REGION_MAP = {
    "전국": "00", "수도권": "S0", "지방권": "L0",
    "서울": "11", "부산": "26", "대구": "27", "인천": "28",
    "광주": "29", "대전": "30", "울산": "31", "세종": "36",
    "경기": "41", "강원": "42", "충북": "43", "충남": "44",
    "전북": "45", "전남": "46", "경북": "47", "경남": "48", "제주": "50",
}

STAT_TABLES = {
    "sale": "A_2024_00045",   # (월) 매매가격지수_아파트
    "rent": "A_2024_00050",   # (월) 전세가격지수_아파트
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


def fetch_index(api_key, statbl_id, month_str):
    # type: (str, str, str) -> Dict[str, float]
    url = "{}?KEY={}&STATBL_ID={}&DTACYCLE_CD=MM&WRTTIME_IDTFR_ID={}&Type=json&pSize=300".format(
        BASE_URL, api_key, statbl_id, month_str
    )
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        d = json.loads(resp.read())

    rows = d["SttsApiTblData"][1]["row"]
    result = {}
    for r in rows:
        full = r.get("CLS_FULLNM", "")
        name = r["CLS_NM"]
        val = float(r["DTA_VAL"])
        # 시도 레벨만 (depth 0)
        if full.count(">") == 0:
            result[name] = val
    return result


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


def main():
    logger.info("=== R-ONE 매매가격지수 변동률 동기화 시작 ===")

    env = load_env()
    api_key = env.get("REALESTATE_STAT_API_KEY", "")
    if not api_key:
        logger.error("REALESTATE_STAT_API_KEY 없음")
        return

    now = datetime.now()
    this_month = now.strftime("%Y%m")
    prev = now.replace(day=1) - timedelta(days=1)
    last_month = prev.strftime("%Y%m")

    conn = get_db()

    for trade_type, statbl_id in STAT_TABLES.items():
        logger.info("처리: {} ({})".format(trade_type, statbl_id))

        try:
            this_data = fetch_index(api_key, statbl_id, this_month)
            last_data = fetch_index(api_key, statbl_id, last_month)
        except Exception as e:
            logger.warning("  이번달({}) 데이터 없음, 직전 2개월 비교: {}".format(this_month, e))
            try:
                this_data = fetch_index(api_key, statbl_id, last_month)
                prev2 = prev.replace(day=1) - timedelta(days=1)
                last_data = fetch_index(api_key, statbl_id, prev2.strftime("%Y%m"))
            except Exception as e2:
                logger.error("  데이터 가져오기 실패: {}".format(e2))
                continue

        period_label = "{}년 {}월 (부동산원)".format(now.year, now.month)
        count = 0

        for region_name, code in REGION_MAP.items():
            if region_name in this_data and region_name in last_data:
                this_val = this_data[region_name]
                last_val = last_data[region_name]
                change = ((this_val - last_val) / last_val) * 100 if last_val > 0 else 0

                conn.execute("""
                    INSERT OR REPLACE INTO price_changes
                        (region_code, region_name, period_type, period_label, trade_type,
                         change_rate, avg_price, prev_avg_price, trade_count, updated_at)
                    VALUES (?, ?, 'monthly', ?, ?, ?, ?, ?, 0, datetime('now'))
                """, (code, region_name, period_label, trade_type,
                      round(change, 3), round(this_val, 2), round(last_val, 2)))
                count += 1
                logger.info("  {} : {:+.3f}% (지수 {:.2f} → {:.2f})".format(
                    region_name, change, last_val, this_val))

        conn.commit()
        logger.info("  → {}건 저장".format(count))

    conn.close()
    logger.info("=== 완료 ===")


if __name__ == "__main__":
    main()
