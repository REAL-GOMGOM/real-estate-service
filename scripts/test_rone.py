#!/usr/bin/env python3
import json, urllib.request

KEY = "72f1d35f468040a9884b4449dd258370"
BASE = "https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do"

def fetch(month):
    url = "{}?KEY={}&STATBL_ID=A_2024_00050&DTACYCLE_CD=MM&WRTTIME_IDTFR_ID={}&Type=json&pSize=300".format(BASE, KEY, month)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as resp:
        d = json.loads(resp.read())
    rows = d["SttsApiTblData"][1]["row"]
    result = {}
    for r in rows:
        full = r.get("CLS_FULLNM", "")
        name = r["CLS_NM"]
        val = float(r["DTA_VAL"])
        depth = full.count(">")
        if depth == 0:
            result[name] = val
    return result

feb = fetch("202602")
jan = fetch("202601")

print("{:8} | {:>10} | {:>10} | {:>8}".format("지역", "1월 지수", "2월 지수", "변동률"))
print("-" * 50)

targets = ["전국","수도권","서울","부산","대구","인천","광주","대전","울산","세종",
           "경기","강원","충북","충남","전북","전남","경북","경남","제주",
           "강북지역","강남지역"]

for region in targets:
    if region in feb and region in jan:
        change = ((feb[region] - jan[region]) / jan[region]) * 100
        print("{:8} | {:10.2f} | {:10.2f} | {:+7.3f}%".format(region, jan[region], feb[region], change))
    elif region in feb:
        print("{:8} |        N/A | {:10.2f} |     N/A".format(region, feb[region]))
