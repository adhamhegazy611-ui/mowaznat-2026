# dwg2dxf (LibreDWG)

محوّل DWG → DXF بيستخدمه `/api/qt` في حصر الكميات.

- المصدر: https://github.com/LibreDWG/libredwg — commit `b8516e8213531922ae4981be09b500a78f1b56c1`
- اتبنى static على Linux x86_64:
  `cmake .. -DBUILD_SHARED_LIBS=OFF -DENABLE_LTO=OFF -DCMAKE_EXE_LINKER_FLAGS=-static && make dwg2dxf && strip dwg2dxf`
- الرخصة: GNU GPL v3 (COPYING-libredwg.txt). الكود المصدري متاح من الرابط اللي فوق.
