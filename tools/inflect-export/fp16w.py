"""Store large float32 initializers as float16 + Cast->float32 (fp32 compute, half the download)."""
import sys, onnx, numpy as np
from onnx import numpy_helper, helper, TensorProto
src, dst = sys.argv[1], sys.argv[2]
m = onnx.load(src); g = m.graph; new_inits = []; casts = []
for init in g.initializer:
    if init.data_type == TensorProto.FLOAT and np.prod(init.dims) >= 1024:
        a = numpy_helper.to_array(init).astype(np.float16)
        h = numpy_helper.from_array(a, init.name + '__f16'); new_inits.append(h)
        casts.append(helper.make_node('Cast', [h.name], [init.name], to=TensorProto.FLOAT, name=init.name + '__cast'))
    else:
        new_inits.append(init)
del g.initializer[:]; g.initializer.extend(new_inits)
nodes = list(g.node); del g.node[:]; g.node.extend(casts + nodes)
onnx.save(m, dst); print(dst, len(casts), 'weights stored fp16')
