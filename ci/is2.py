# ICESat-2 (ليزر ناسا، 2018 → النهارده) فوق حدود المشروع عن طريق SlideRule (خدمة عامة من غير تسجيل)
# المدخل: /tmp/is2_in.json = {"poly":[{"lon":..,"lat":..},...], "t0":"2018-10-01", "t1":"2026-12-31"}
# المخرج: /tmp/is2_out.json = نقط الأرض (lat, lon, ارتفاع فوق مستوى سطح البحر EGM2008، التاريخ، المسار)
import json, sys, traceback
out = {"pts": [], "err": None}
try:
    inp = json.load(open('/tmp/is2_in.json'))
    from sliderule import sliderule, icesat2
    sliderule.init("slideruleearth.io", verbose=False)
    parms = {"poly": inp["poly"], "t0": inp.get("t0", "2018-10-01T00:00:00Z"), "t1": inp.get("t1", "2026-12-31T00:00:00Z"),
             "cnf": "atl03_high", "atl08_class": ["atl08_ground"], "ats": 5.0, "cnt": 5, "len": 20.0, "res": 10.0, "maxi": 6}
    gdf = icesat2.atl06p(parms)
    if gdf is not None and len(gdf):
        import pyproj
        pyproj.network.set_network_enabled(True)
        tr = pyproj.Transformer.from_crs("EPSG:4979", "EPSG:4326+3855", always_xy=True)
        lon = gdf.geometry.x.values; lat = gdf.geometry.y.values; h = gdf["h_mean"].values
        _, _, ho = tr.transform(lon, lat, h)
        t = [str(x)[:10] for x in gdf.index.values]
        rgt = gdf["rgt"].values if "rgt" in gdf else [0] * len(gdf)
        for i in range(len(gdf)):
            if ho[i] == ho[i] and abs(ho[i]) < 9000:
                out["pts"].append([float(lat[i]), float(lon[i]), round(float(ho[i]), 3), t[i], int(rgt[i]), round(float(h[i]), 3)])
except Exception as e:
    out["err"] = (str(e) + " | " + traceback.format_exc()[-400:])[:800]
json.dump(out, open('/tmp/is2_out.json', 'w'))
print("is2 points", len(out["pts"]), "err" if out["err"] else "")
