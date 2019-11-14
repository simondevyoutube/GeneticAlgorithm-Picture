
function lerp(x, a, b) {
  return x * (b - a) + a;
}

function CalculateFitness(srcData, dstData) {
  let fitness = 0;
  const D1 = srcData.data;
  const D2 = dstData.data;
  for (let i = 0; i < D1.length; i+=4) {
    for (let j = 0; j < 3; j++) {
      const c1 = D1[i + j] / 255.0;
      const c2 = D2[i + j] / 255.0;
      fitness += (c1 - c2) ** 2;
    }
  }

  fitness /= (srcData.width * srcData.height * 3);
  fitness = Math.max(fitness, 0.001);
  return 1.0 / fitness;
}

function DrawTexture_ELLIPSE(genotype, dstWidth, dstHeight) {
  const canvas = new OffscreenCanvas(dstWidth, dstHeight);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'rgba(0, 0, 0, 1)';
  ctx.fillRect(0, 0, dstWidth, dstHeight);

  for (let gene of genotype) {
    const r = gene[0] * 255;
    const g = gene[1] * 255;
    const b = gene[2] * 255;
    const a = lerp(gene[3], 0.05, 0.25);
    const x1 = gene[4] * dstWidth;
    const y1 = gene[5] * dstHeight;
    const w = lerp(gene[6], 0.01, 0.25) * dstWidth;
    const h = lerp(gene[7], 0.01, 0.25) * dstHeight;
    ctx.beginPath();
    ctx.ellipse(x1, y1, w, h, 0, 0, 2 * Math.PI);
    ctx.closePath();
    ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    ctx.fill();
  }

  const data = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);

  return data;
}

function DrawTexture_LINE(genotype, dstWidth, dstHeight) {
  const key = dstWidth + '-' + dstHeight;
  if (!(key in _CONTEXTS)) {
    const canvas = new OffscreenCanvas(dstWidth, dstHeight);
    _CONTEXTS[key] = canvas.getContext('2d');
  }

  const ctx = _CONTEXTS[key];

  ctx.fillStyle = 'rgba(0, 0, 0, 1)';
  ctx.fillRect(0, 0, dstWidth, dstHeight);

  for (let gene of genotype) {
    const r = gene[0] * 255;
    const g = gene[1] * 255;
    const b = gene[2] * 255;
    const a = lerp(gene[3], 0.05, 0.25);
    const lw = gene[4] * dstWidth * 0.25;
    const x1 = gene[5] * dstWidth;
    const y1 = gene[6] * dstHeight;
    const x2 = gene[7] * dstWidth;
    const y2 = gene[8] * dstHeight;
    ctx.strokeStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.closePath();
    ctx.stroke();
  }

  const data = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);

  return data;
}

function ProcessWorkItem(e) {
  const data = e.data;

  if (data.action == 'setup') {
    _FRAME_PARAMS = data;
    return {action: 'ready'};
  } else if (data.action == 'work') {
    const fitnesses = [];

    for (const workItem of data.work) {
      let resultData = null;
      if (data.type == 'line') {
        resultData = DrawTexture_LINE(
            workItem.genotype,
            _FRAME_PARAMS.srcData.width, _FRAME_PARAMS.srcData.height);
      } else if (data.type == 'ellipse') {
        resultData = DrawTexture_ELLIPSE(
            workItem.genotype,
            _FRAME_PARAMS.srcData.width, _FRAME_PARAMS.srcData.height);
      }

      fitnesses.push({
          fitness: CalculateFitness(_FRAME_PARAMS.srcData, resultData),
          index: workItem.index,
      });
    }

    return {
        action: 'work-complete',
        result: fitnesses
    };
  } else if (data.action == 'draw') {
    let resultData = null;
    if (data.type == 'line') {
      resultData = DrawTexture_LINE(data.genotype, data.width, data.height);
    } else if (data.type == 'ellipse') {
      resultData = DrawTexture_ELLIPSE(data.genotype, data.width, data.height);
    }
    return {
        action: 'work-complete',
        result: {imageData: resultData}
    };
  }
}

let _FRAME_PARAMS = null;
const _CONTEXTS = {};

onmessage = function(e) {
  postMessage(ProcessWorkItem(e));
}
