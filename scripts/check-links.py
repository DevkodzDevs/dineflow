import re, os, glob
ROOT="apps/web/app"
# 1. routes that exist
routes=set()
for p in glob.glob(f"{ROOT}/**/page.tsx", recursive=True):
    r=os.path.dirname(p)[len(ROOT):]
    r=re.sub(r'/\([^)]+\)','',r) or "/"
    routes.add(r if r.startswith("/") else "/"+r)
apis=set()
for p in glob.glob(f"{ROOT}/api/**/route.ts", recursive=True):
    apis.add(os.path.dirname(p)[len(ROOT):])
def matches(target, table):
    t=target.split("?")[0].split("#")[0].rstrip("/") or "/"
    for r in table:
        pat="^"+re.sub(r'\[\.\.\.[^\]]+\]','.+',re.sub(r'\[[^\]]+\]','[^/]+',r)).replace("/","\\/")+"$"
        if re.match(pat,t): return True
    return False
# 2. every link target in the code
targets=[]
for p in glob.glob("apps/web/**/*.ts*", recursive=True):
    if "node_modules" in p or ".next" in p: continue
    s=open(p,encoding="utf-8",errors="ignore").read()
    for m in re.finditer(r'(?:href|redirect|router\.push|router\.replace|go)\s*[=(:]\s*[{(]?\s*[`"\']([^`"\']+)[`"\']', s):
        targets.append((p, m.group(1)))
    for m in re.finditer(r'fetch\(\s*[`"\'](/api/[^`"\'?]+)', s):
        targets.append((p, m.group(1)))
    for m in re.finditer(r'href:\s*"(/[^"]*)"', s):   # nav ITEMS
        targets.append((p, m.group(1)))
bad=[]; seen=set()
for p,t in targets:
    if t.startswith("http") or t.startswith("mailto") or t.startswith("tel") or t.startswith("#") or t=="": continue
    t2=re.sub(r'\$\{[^}]+\}','[x]',t)          # template vars → dynamic
    if not t2.startswith("/"): continue
    key=(t2.split("?")[0])
    if key in seen: continue
    seen.add(key)
    ok = matches(t2, apis) if t2.startswith("/api/") else matches(t2, routes)
    if not ok: bad.append((t2,p))
print("routes:",len(routes),"| api routes:",len(apis),"| distinct link targets checked:",len(seen))
print("UNRESOLVED:" if bad else "every web link resolves")
for t,p in sorted(bad): print("  ",t,"  ←",p.replace("apps/web/",""))
# 3. mobile
mroutes=set(re.sub(r'\.tsx$','',os.path.relpath(p,"apps/mobile/app")) for p in glob.glob("apps/mobile/app/**/*.tsx",recursive=True) if not os.path.basename(p).startswith("_"))
mt=set()
for p in glob.glob("apps/mobile/**/*.ts*",recursive=True):
    if "node_modules" in p: continue
    s=open(p,encoding="utf-8",errors="ignore").read()
    for m in re.finditer(r'router\.(?:push|replace)\(\s*[`"\']([^`"\']+)[`"\']', s): mt.add(m.group(1))
    for m in re.finditer(r'(?:href|go):\s*"(/[^"]*)"', s): mt.add(m.group(1))
mbad=[t for t in mt if t.lstrip("/") not in mroutes and re.sub(r'\$\{[^}]+\}','x',t.lstrip("/")) not in mroutes]
print("mobile screens:",len(mroutes),"| push targets:",len(mt))
print("mobile UNRESOLVED:" if mbad else "every mobile link resolves"); [print("  ",t) for t in sorted(mbad)]
