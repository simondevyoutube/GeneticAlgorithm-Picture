
import {render} from "./render.js";

function rand_range(a, b) {
  return Math.random() * (b - a) + a;
}

function rand_normalish() {
  const r = Math.random() + Math.random() + Math.random() + Math.random();
  return (r / 4.0) * 2.0 - 1;
}

function lerp(x, a, b) {
  return x * (b - a) + a;
}

function clamp(x, a, b) {
  return Math.min(Math.max(x, a), b);
}

function sat(x) {
  return Math.min(Math.max(x, 0.0), 1.0);
}


class Population {
  constructor(params) {
    this._params = params;
    this._population = [...Array(this._params.population_size)].map(
        _ => ({fitness: 1, genotype: this._CreateRandomgenotype()}));
    this._lastGeneration = null;
    this._generations = 0;
    this._callback = null;
  }

  _CreateRandomGene() {
    return this._params.gene.ranges.map(r => rand_range(r[0], r[1]));
  }

  _CreateRandomgenotype() {
    return [...Array(this._params.genotype.size)].map(
        _ => this._CreateRandomGene());
  }

  Fittest() {
    return this._lastGeneration.parents[0];
  }

  async Run(srcData) {
    await render.setup(srcData);

    while (true) {
      await this._Step(srcData);
    }
  }

  async _Step(tgtImgData) {
    await this._StepPopulation(tgtImgData);

    const parents = this._population.sort((a, b) => (b.fitness - a.fitness));

    this._lastGeneration = {parents: parents};
    this._generations += 1;

    // Draw the main canvas on the worker while breeding next population.
    const cbPromise = this._callback(this, this._lastGeneration.parents[0]);

    this._population = this._BreedNewPopulation(parents);

    if (this._params.genotype.growth_per_increase > 0 ||
        this._params.genotype.size < this._params.genotype.max_size) {
      const increase = (
          (this._generations + 1) % this._params.genotype.generations_per_increase) == 0;
      if (increase) {
        const geneIncrease = this._params.genotype.growth_per_increase;
        this._params.genotype.size += geneIncrease;

        for (let i = 0; i < geneIncrease; i++) {
          for (let p of this._population) {
            p.genotype.push([...this._CreateRandomGene()]);
          }
        }
      }
    }
    await cbPromise;
  }

  async _StepPopulation(tgtImgData) {
    // Wait for them all to be done
    const promises = render.calculateFitnesses(
        this._params.gene.type, this._population.map(p => p.genotype));
    const responses = await Promise.all(promises);

    for (const r of responses) {
      for (const f of r.result) {
        this._population[f.index].fitness = f.fitness;
      }
    }
  }

  _BreedNewPopulation(parents) {
    function _RouletteSelection(sortedParents, totalFitness) {
      const roll = Math.random() * totalFitness;
      let sum = 0;
      for (let p of sortedParents) {
        sum += p.fitness;
        if (roll < sum) {
          return p;
        }
      }
      return sortedParents[sortedParents.length - 1];
    }

    function _RandomParent(sortedParents, otherParent, totalFitness) {
      const p = _RouletteSelection(sortedParents, totalFitness);
      return p;
    }

    function _CopyGenotype(g) {
      return ({
          fitness: g.fitness,
          genotype: [...g.genotype].map(gene => [...gene])
      });
    }

    const newPopulation = [];
    const totalFitness = parents.reduce((t, p) => t + p.fitness, 0);
    const numChildren = Math.ceil(parents.length * 0.8);

    const top = [...parents.slice(0, Math.ceil(parents.length * 0.25))];
    for (let j = 0; j < numChildren; j++) {
      const i = j % top.length;
      const p1 = top[i];
      const p2 = _RandomParent(parents, p1, totalFitness);

      const g = [];
      for (let r = 0; r < p1.genotype.length; r++ ) {
        const roll = Math.random();
        g.push(roll < 0.5 ? p1.genotype[r] : p2.genotype[r]);
      }
      newPopulation.push(_CopyGenotype({fitness: 1, genotype: g}));
    }

    // Let's say keep top X% go through, but with mutations
    const top5 = [...parents.slice(0, Math.ceil(parents.length * 0.05))];

    newPopulation.push(...top5.map(x => _CopyGenotype(x)));

    // Mutations!
    for (let p of newPopulation) {
      const genotypeLength = p.genotype.length;
      const mutationOdds = this._params.mutation.odds;
      const mutationMagnitude = this._params.mutation.magnitude;
      const mutationDecay = this._params.mutation.decay;
      function _Mutate(x, i) {
        const roll = Math.random();

        if (roll < mutationOdds) {
          const xi = genotypeLength - i;
          const mutationMod = Math.E ** (-1 * xi * mutationDecay);
          if (mutationMod <= 0.0001) {
            return x;
          }
          const magnitude = mutationMagnitude * mutationMod * rand_normalish();
          return sat(x + magnitude);
        }
        return x;
      }

      p.genotype = p.genotype.map(
          (g, i) => g.map(
              (x, xi) => _Mutate(x, i)));
    }

    // Immortality granted to the winners from the last life. May the odds be
    // forever in your favour.
    newPopulation.push(...top5.map(x => _CopyGenotype(x)));

    // Create a bunch of random crap to fill out the rest.
    while (newPopulation.length < parents.length) {
      newPopulation.push(
          {fitness: 1, genotype: this._CreateRandomgenotype()});
    }

    return newPopulation;
  }
}


class GeneticAlgorithmDemo {
  constructor() {
    this._Init();
  }

  _Init(scene) {
    this._statsText1 = document.getElementById('statsText');
    this._statsText2 = document.getElementById('numbersText');
    this._sourceImg = document.getElementById('sourceImg');
    this._sourceImg.src = 'assets/square.jpg';
    this._sourceImg.onload = () => {
      const ctx = this._sourceCanvas.getContext('2d');

      this._sourceCanvas.width = 128;
      this._sourceCanvas.height = this._sourceCanvas.width * (
          this._sourceImg.height / this._sourceImg.width);

      ctx.drawImage(
          this._sourceImg,
          0, 0, this._sourceImg.width, this._sourceImg.height,
          0, 0, this._sourceCanvas.width, this._sourceCanvas.height);

      this._sourceLODData = ctx.getImageData(
          0, 0, this._sourceCanvas.width, this._sourceCanvas.height);

      this._sourceCanvas.width = 800;
      this._sourceCanvas.height = this._sourceCanvas.width * (
          this._sourceImg.height / this._sourceImg.width);
      this._targetCanvas.width = this._sourceCanvas.width;
      this._targetCanvas.height = this._sourceCanvas.height;

      ctx.drawImage(
          this._sourceImg,
          0, 0, this._sourceImg.width, this._sourceImg.height,
          0, 0, this._sourceCanvas.width, this._sourceCanvas.height);

      this._InitPopulation();
    };

    this._sourceCanvas = document.getElementById('source');
    this._targetCanvas = document.getElementById('target');
  }

  _InitPopulation() {
    const GENE_ELLIPSE = {
      type: 'ellipse',
      ranges: [
        [0, 1],
        [0, 1],
        [0, 1],
        [0.01, 0.1],
        [0, 1],
        [0, 1],
        [0.05, 0.5],
        [0, 1],
      ]
    };

    const GENE_LINE = {
      type: 'line',
      ranges: [
        [0, 1],
        [0, 1],
        [0, 1],
        [0.05, 0.2],
        [0, 1],
        [0, 1],
        [0, 1],
        [0, 1],
        [0, 1],
      ]
    };

    const params = {
      population_size: 512,
      genotype: {
        size: 64,
        max_size: 1000,
        generations_per_increase: 50,
        growth_per_increase: 1
      },
      gene: GENE_LINE,
      mutation: {
        magnitude: 0.25,
        odds: 0.1,
        decay: 0,
      }
    };

    this._population = new Population(params);
    this._population._callback = async (population, fittest) => {
      const p1 = render.draw(
          population._params.gene.type, fittest.genotype,
          this._targetCanvas.width, this._targetCanvas.height);

      const hd = await p1;

      const ctx = this._targetCanvas.getContext('2d');
      ctx.putImageData(hd.result.imageData, 0, 0);

      this._statsText2.innerText =
          this._population._generations + '\n' +
          this._population.Fittest().fitness.toFixed(3) + '\n' +
          this._population._population.length + '\n' +
          this._population._params.genotype.size;
    };
    this._population.Run(this._sourceLODData);

    this._statsText1.innerText =
        'Generation:\n' +
        'Fitness:\n' +
        'Population:\n' +
        'Genes:';
  }
}

const _DEMO = new GeneticAlgorithmDemo();
