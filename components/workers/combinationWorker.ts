type ComponentPayload = {
  name: string;
  group: string;
};

type GroupConfig = {
  name: string;
  minMass?: number | null;
  maxMass?: number | null;
  fixedMass?: number | null;
  minCount?: number | null;
  maxCount?: number | null;
};

type StartPayload = {
  components: ComponentPayload[];
  groupConfigs: Record<string, GroupConfig>;
  minTotal: number;
  maxTotal: number;
  ranges: number[][];
  firstValues: number[];
  epsilon: number;
  maxResults: number;
  workerId: number;
};

type WorkerMessage =
  | { type: 'start'; payload: StartPayload }
  | { type: 'stop' };

type ProgressMessage = {
  type: 'progress';
  workerId: number;
  processed: number;
  valid: number;
};

type ResultsMessage = {
  type: 'results';
  workerId: number;
  rows: Float64Array;
  rowCount: number;
};

type DoneMessage = {
  type: 'done';
  workerId: number;
  processed: number;
  valid: number;
  stored: number;
};

const ctx: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope;
let stopRequested = false;
const roundValue = (value: number) => Number(value.toFixed(6));

const postProgress = (message: ProgressMessage) => ctx.postMessage(message);
const postResults = (message: ResultsMessage) =>
  ctx.postMessage(message, [message.rows.buffer]);
const postDone = (message: DoneMessage) => ctx.postMessage(message);

ctx.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const data = event.data;
  if (!data) return;
  if (data.type === 'stop') {
    stopRequested = true;
    return;
  }
  if (data.type !== 'start') return;
  stopRequested = false;
  const {
    components,
    groupConfigs,
    minTotal,
    maxTotal,
    ranges,
    firstValues,
    epsilon,
    maxResults,
    workerId,
  } = data.payload;

  const groupNames = Object.keys(groupConfigs);
  let processed = 0;
  let valid = 0;
  let stored = 0;
  const rowSize = components.length;
  const batchSize = 200;
  let rowsBuffer = new Float64Array(batchSize * rowSize);
  let rowCount = 0;

  const flushRows = () => {
    if (rowCount === 0) return;
    const slice = rowsBuffer.subarray(0, rowCount * rowSize);
    postResults({ type: 'results', workerId, rows: slice, rowCount });
    rowsBuffer = new Float64Array(batchSize * rowSize);
    rowCount = 0;
  };

  const helper = (
    index: number,
    currentValues: number[],
    groupMassSums: Record<string, number>,
    groupCounts: Record<string, number>,
    currentSum: number
  ) => {
    if (stopRequested) return;
    if (index === components.length) {
      processed += 1;
      if (processed % 5000 === 0) {
        postProgress({ type: 'progress', workerId, processed, valid });
      }
      if (currentSum >= minTotal - epsilon && currentSum <= maxTotal + epsilon) {
        let validRow = true;
        for (const group of groupNames) {
          const cfg = groupConfigs[group];
          const mass = groupMassSums[group] || 0;
          const cnt = groupCounts[group] || 0;
          if (cfg.fixedMass !== null && cfg.fixedMass !== undefined) {
            if (Math.abs(mass - cfg.fixedMass) > epsilon) {
              validRow = false;
              break;
            }
          }
          if (cfg.minMass !== null && cfg.minMass !== undefined) {
            if (mass < cfg.minMass - epsilon) {
              validRow = false;
              break;
            }
          }
          if (cfg.minCount !== null && cfg.minCount !== undefined) {
            if (cnt < cfg.minCount) {
              validRow = false;
              break;
            }
          }
          if (cfg.maxMass !== null && cfg.maxMass !== undefined) {
            if (mass > cfg.maxMass + epsilon) {
              validRow = false;
              break;
            }
          }
          if (cfg.maxCount !== null && cfg.maxCount !== undefined) {
            if (cnt > cfg.maxCount) {
              validRow = false;
              break;
            }
          }
        }
        if (validRow) {
          valid += 1;
          if (stored < maxResults) {
            rowsBuffer.set(currentValues, rowCount * rowSize);
            rowCount += 1;
            stored += 1;
            if (rowCount >= batchSize) {
              flushRows();
            }
          }
        }
      }
      return;
    }
    const comp = components[index];
    const group = comp.group;
    for (const val of ranges[index]) {
      if (stopRequested) return;
      const newSum = roundValue(currentSum + val);
      if (newSum > maxTotal + epsilon) continue;
      const gm = { ...groupMassSums };
      const gc = { ...groupCounts };
      if (val > 0) {
        gm[group] = (gm[group] || 0) + val;
        gc[group] = (gc[group] || 0) + 1;
      }
      const cfg = groupConfigs[group];
      if (cfg.fixedMass !== null && cfg.fixedMass !== undefined) {
        if (gm[group] > cfg.fixedMass + epsilon) continue;
      }
      if (cfg.maxMass !== null && cfg.maxMass !== undefined) {
        if (gm[group] > cfg.maxMass + epsilon) continue;
      }
      if (cfg.maxCount !== null && cfg.maxCount !== undefined) {
        if (gc[group] > cfg.maxCount) continue;
      }
      helper(index + 1, [...currentValues, val], gm, gc, newSum);
    }
  };

  for (const firstVal of firstValues) {
    if (stopRequested) break;
    const firstGroup = components[0].group;
    const initialMass: Record<string, number> = {};
    const initialCount: Record<string, number> = {};
    let sum = roundValue(firstVal);
    if (firstVal > 0) {
      initialMass[firstGroup] = firstVal;
      initialCount[firstGroup] = 1;
    }
    if (sum > maxTotal + epsilon) {
      processed += ranges.slice(1).reduce((acc, arr) => acc * arr.length, 1);
      continue;
    }
    helper(1, [firstVal], initialMass, initialCount, sum);
  }

  postProgress({ type: 'progress', workerId, processed, valid });
  flushRows();
  postDone({ type: 'done', workerId, processed, valid, stored });
};
