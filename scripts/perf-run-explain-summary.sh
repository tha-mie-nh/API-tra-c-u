#!/usr/bin/env bash
# Chạy perf-explain-query-logs.sql N lần (mặc định 3), in median "Execution Time" + cờ Seq Scan mỗi truy vấn.
# Usage: scripts/perf-run-explain-summary.sh [runs]   (chỉ DB app_tra_cuu_perf trên container test)
set -euo pipefail
RUNS="${1:-3}"; DIR="$(cd "$(dirname "$0")" && pwd)"; C=app-tra-cuu-du-lieu-test-postgres-1
for i in $(seq "$RUNS"); do
  docker exec -i "$C" psql -U app_user -d app_tra_cuu_perf < "$DIR/perf-explain-query-logs.sql" > "${TMPDIR:-/tmp}/perf-explain-run-$i.txt"
done
python3 - "$RUNS" <<'PY'
import re,sys,statistics,os
runs=int(sys.argv[1]); tmp=os.environ.get('TMPDIR','/tmp'); data={}; seq={}; plan={}
for i in range(1,runs+1):
    q=None
    for line in open(f'{tmp}/perf-explain-run-{i}.txt'):
        m=re.match(r'== Q:(\S+)',line)
        if m: q=m.group(1); continue
        m=re.search(r'Execution Time: ([\d.]+) ms',line)
        if m and q: data.setdefault(q,[]).append(float(m.group(1)))
        if q and 'Seq Scan' in line: seq[q]=True
        m=re.search(r'(Index(?: Only)? Scan[^(]*|Bitmap Index Scan[^(]*|Seq Scan[^(]*)\(',line)
        if q and m and q not in plan: plan[q]=m.group(1).strip()
for q,v in data.items():
    print(f'{q:42s} {statistics.median(v):9.1f} ms  seq={"Y" if seq.get(q) else "-"}  {plan.get(q,"")}')
PY
