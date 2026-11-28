# ICESat-2 ATL08 (ليزر ناسا، 2018 → النهارده) فوق حدود المشروع — قراءة جزئية للملفات من ناسا بتوكن Earthdata
# المدخل: /tmp/is2_in.json = {"bbox":[lon0,lat0,lon1,lat1], "urls":[...]}
# المخرج: /tmp/is2_out.json = نقط الأرض [lat, lon, ارتفاع EGM2008, التاريخ, المسار، الارتفاع فوق الإليبسويد]
import json, os, traceback, datetime
out = {"pts": [], "err": None, "files": 0, "fail": 0}
try:
    import numpy as np, h5py, pyproj, requests, concurrent.futures as cf
    inp = json.load(open('/tmp/is2_in.json')); x0, y0, x1, y1 = inp["bbox"]
    tok = os.environ.get("EARTHDATA_TOKEN", "")
    if not tok: raise Exception("no token")
    sess = requests.Session(); sess.headers["Authorization"] = "Bearer " + tok
    def dl(u):
        fn = "/tmp/is2_" + u.rsplit("/", 1)[1]
        try:
            r = sess.get(u, stream=True, timeout=300); r.raise_for_status()
            with open(fn, "wb") as w:
                for ch in r.iter_content(8 << 20): w.write(ch)
            return fn
        except Exception as e:
            return "ERR " + str(e)[:200]
    with cf.ThreadPoolExecutor(8) as ex: files = list(ex.map(dl, inp["urls"]))
    pyproj.network.set_network_enabled(True)
    tr = pyproj.Transformer.from_crs("EPSG:4979", "EPSG:4326+3855", always_xy=True)
    ep = datetime.datetime(2018, 1, 1)
    for u in files:
        try:
            if u.startswith("ERR"): raise Exception(u)
            with h5py.File(u, "r") as h:
                gps = float(h["ancillary_data/atlas_sdp_gps_epoch"][0])
                rgt = int(h["orbit_info/rgt"][0]) if "orbit_info/rgt" in h else 0
                for b in ["gt1l", "gt1r", "gt2l", "gt2r", "gt3l", "gt3r"]:
                    if b + "/land_segments/latitude" not in h: continue
                    la = h[b + "/land_segments/latitude"][:]; lo = h[b + "/land_segments/longitude"][:]
                    m = (la >= y0) & (la <= y1) & (lo >= x0) & (lo <= x1)
                    if not m.any(): continue
                    idx = np.where(m)[0]
                    hz = h[b + "/land_segments/terrain/h_te_best_fit"][idx[0]:idx[-1] + 1][idx - idx[0]]
                    dt = h[b + "/land_segments/delta_time"][idx[0]:idx[-1] + 1][idx - idx[0]]
                    for k, i in enumerate(idx):
                        z = float(hz[k])
                        if not (abs(z) < 9000): continue
                        _, _, zo = tr.transform(float(lo[i]), float(la[i]), z)
                        d = (datetime.datetime(1980, 1, 6) + datetime.timedelta(seconds=gps + float(dt[k]))).strftime("%Y-%m-%d")
                        out["pts"].append([float(la[i]), float(lo[i]), round(float(zo), 3), d, rgt, round(z, 3), b])
            out["files"] += 1
            os.remove(u)
        except Exception as e:
            out["fail"] += 1
            if out["fail"] <= 2: out["err"] = (str(e))[:300]
except Exception as e:
    out["err"] = (str(e) + " | " + traceback.format_exc()[-300:])[:600]
json.dump(out, open('/tmp/is2_out.json', 'w'))
print("is2 points", len(out["pts"]), "files", out["files"], "fail", out["fail"])
