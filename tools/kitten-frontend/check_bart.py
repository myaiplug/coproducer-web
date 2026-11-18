"""NumPy BART (kfront/bart_np.py) vs transformers greedy decoding on 510 words: python check_bart.py /path/to/kitten-tts-2-mini"""
import json, os, random, sys, time, torch
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'js', 'voice-tags', 'vendor', 'kitten-frontend'))
from kfront.bart_np import BartG2P
from transformers import BartForConditionalGeneration
D=sys.argv[1] + '/g2p/g2p_bart_en_us'  # arg: local copy of KittenML/kitten-tts-2-mini
cfg=json.load(open(D+'/config.json'))
npm=BartG2P(D+'/model.safetensors', cfg)
tm=BartForConditionalGeneration.from_pretrained(D, local_files_only=True).eval()
g2i={c:i for i,c in enumerate(cfg['grapheme_chars']) if i>3}
words=list(json.load(open(os.path.join(os.path.dirname(__import__('misaki').__file__), 'data', 'us_gold.json'))).keys())
random.seed(1); ws=[w for w in random.sample(words,700) if all(c in g2i for c in w)][:500]
ws+= ['Beez','CoProducer','Liminal','beezbeats','Zyphra','Kitten','VoxMel','Louisville','Grokbot','supercalifragilistic']
same=0; t0=time.time(); tn=0
for w in ws:
    ids=[1]+[g2i[c] for c in w[:62]]+[2]
    a=npm.generate(ids)
    with torch.no_grad(): b=tm.generate(input_ids=torch.tensor([ids]),max_length=64,num_beams=1,do_sample=False)[0].tolist()
    same+= a==b
    if a!=b: print('DIFF',w,a,b)
print(f'{same}/{len(ws)} identical; numpy time {time.time()-t0:.1f}s total')
