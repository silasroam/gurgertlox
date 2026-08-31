# -*- coding: utf-8 -*-
import math, io

# case_id: (name, bounding W, bounding H)
cases = {
 'case_19':   ('sumercase',    1157, 768),
 'case_49':   ('newyearcase',  1254, 741),
 'case_99':   ('toxiccase',    1008, 888),
 'case_199':  ('oceancase',    1000, 561),
 'case_399':  ('pashacase',    1210, 745),
 'case_799':  ('daycase',       800, 687),
 'case_1249': ('halouincase',  1672, 941),
 'case_1999': ('lovecase',     1368, 736),
 'case_2999': ('gemcase',      1006, 813),
 'case_4999': ('forestcase',   1223, 736),
 'case_9999': ('hellcase',     1557, 1203),
 'case_19999':('pokercase',    931, 755),
}

# reference = pokercase (case_19999)
ref_w, ref_h = cases['case_19999'][1], cases['case_19999'][2]
ref_area = ref_w * ref_h
ref_aspect = ref_w / ref_h

rows = []
for cid in cases:
    name, bw, bh = cases[cid]
    aspect = bw / bh
    area = bw * bh
    # area-based uniform scale (preserves proportions):
    scale_area = math.sqrt(ref_area / area)
    # height-based scale won mobile contain-by-width (visual height equal): scale_h = aspect / ref_aspect
    scale_h = aspect / ref_aspect
    rows.append((cid, name, bw, bh, aspect, scale_area, scale_h))

print_out = '%-12s %-12s %6s %6s %6s %8s %8s' % ('case','name','W','H','aspect','scale_area','scale_h')
lines = [print_out, '-'*72]
for cid,name,bw,bh,asp,sa,sh in rows:
    lines.append('%-12s %-12s %6d %6d %7.3f %9.3f %9.3f' % (cid,name,bw,bh,asp,sa,sh))
lines.append('')
lines.append('ref pokercase: area=%d aspect=%.3f' % (ref_area, ref_aspect))
open('_scale.txt','w',encoding='utf-8').write('\n'.join(lines))