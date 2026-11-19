import pyarrow.parquet as pq, json
from huggingface_hub import HfFileSystem
fs=HfFileSystem(); out=[]
files=sorted(fs.glob('datasets/MLCommons/peoples_speech/test/*.parquet'))+sorted(fs.glob('datasets/MLCommons/peoples_speech/validation/*.parquet'))
for p in files:
    pf=pq.ParquetFile(fs.open(p, block_size=1<<20))
    for g in range(pf.metadata.num_row_groups):
        for i,r in enumerate(pf.read_row_group(g, columns=['id','text','duration_ms']).to_pylist()):
            out.append({'file':p,'rg':g,'i':i,**r})
    print(p, len(out), flush=True)
json.dump(out, open('ps_index.json','w'))
