import json,subprocess,numpy as np,collections,sys
def f0(path):
    a=np.frombuffer(subprocess.run(["ffmpeg","-v","error","-i",path,"-ac","1","-ar","16000","-f","s16le","-"],capture_output=True).stdout,np.int16).astype(float)
    dur=len(a)/16000; fs=[]
    for i in range(0,len(a)-640,320):
        x=a[i:i+640]
        if np.sqrt((x**2).mean())<800: continue
        x=x-x.mean(); c=np.correlate(x,x,'full')[639:]
        lo,hi=16000//400,16000//70; k=lo+np.argmax(c[lo:hi])
        if c[k]>0.4*c[0]: fs.append(16000/k)
    return (np.median(fs) if fs else 0),dur
R=collections.defaultdict(list)
for n in map(int,sys.argv[1:]):
    L=json.load(open(f"lessons/lesson-{n:02d}.json"))
    for k,v in L["audio"].items():
        if v.get("voice") in (None,"model"): continue
        p,d=f0(f"audio/l{n:02d}/{k}.mp3"); w=len(v["text"].split())
        R[v["voice"]].append((p,w/d))
for v,xs in sorted(R.items()):
    p=[x[0] for x in xs if x[0]]; r=[x[1] for x in xs]
    print(f"{v:8} n={len(xs):3} F0={np.median(p):5.0f} wps={np.median(r):.2f}")
