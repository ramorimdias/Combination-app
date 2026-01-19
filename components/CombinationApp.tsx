"use client";

import { useState, useCallback, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';

interface ComponentInput {
  id: string;
  name: string;
  group: string;
  min: number | null;
  max: number | null;
  step: number | null;
  fixed?: number | null;
}

interface GroupConfig {
  name: string;
  minMass?: number | null;
  maxMass?: number | null;
  fixedMass?: number | null;
  minCount?: number | null;
  maxCount?: number | null;
}

interface ResultRow {
  [key: string]: number;
}

// Utility to generate a random id
const uid = () => Math.random().toString(36).substring(2, 9);

export default function CombinationApp() {
  // Components state
  const [components, setComponents] = useState<ComponentInput[]>([
    {
      id: uid(),
      name: 'Component 1',
      group: 'A',
      min: 0,
      max: 1,
      step: 0.1,
      fixed: null,
    },
  ]);
  // Group config state keyed by group name
  const [groupConfigs, setGroupConfigs] = useState<Record<string, GroupConfig>>({
    A: { name: 'A', minMass: null, maxMass: null, fixedMass: null, minCount: null, maxCount: null },
  });
  // Generation state
  const [generating, setGenerating] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [isHydrated, setIsHydrated] = useState<boolean>(false);
  const [minTotal, setMinTotal] = useState<number | null>(0.99);
  const [maxTotal, setMaxTotal] = useState<number | null>(1.01);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [inputUnit, setInputUnit] = useState<'ratio' | 'percent'>('percent');
  const [resultUnit, setResultUnit] = useState<'ratio' | 'percent'>('ratio');

  const storageKey = 'combinationAppSetup';
  const epsilon = 1e-6;
  const roundValue = (value: number) => Number(value.toFixed(6));
  const inputBase =
    'rounded-md border border-neutral-700 bg-neutral-950/70 px-2 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500/60 focus:border-red-500';
  const inputRight = `${inputBase} text-right`;
  const inputCenter = `${inputBase} text-center`;
  const formatPercent = (value: number | null) =>
    value === null || Number.isNaN(value) ? '' : (value * 100).toFixed(1);
  const parsePercent = (value: string) => (value === '' ? null : Number(value) / 100);
  const formatInputValue = (value: number | null) =>
    inputUnit === 'percent' ? formatPercent(value) : value ?? '';
  const parseInputValue = (value: string) =>
    inputUnit === 'percent' ? parsePercent(value) : value === '' ? null : Number(value);
  const inputMin = inputUnit === 'percent' ? 0 : 0;
  const inputMax = inputUnit === 'percent' ? 100 : 1;
  const inputStep = inputUnit === 'percent' ? 0.1 : 0.001;
  const decimalPlaces = (value: number) => {
    if (!Number.isFinite(value)) return 0;
    const text = value.toString();
    if (!text.includes('.')) return 0;
    return text.split('.')[1].length;
  };

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) {
      setIsHydrated(true);
      return;
    }
    try {
      const parsed = JSON.parse(stored) as {
        components?: ComponentInput[];
        groupConfigs?: Record<string, GroupConfig>;
        minTotal?: number | null;
        maxTotal?: number | null;
      };
      if (parsed.components && parsed.components.length > 0) {
        const normalized = parsed.components.map((comp) => ({
          ...comp,
          step: typeof comp.step === 'number' && !Number.isNaN(comp.step) ? comp.step : 0.1,
        }));
        setComponents(normalized);
      }
      if (parsed.groupConfigs && Object.keys(parsed.groupConfigs).length > 0) {
        setGroupConfigs(parsed.groupConfigs);
      }
      if (parsed.minTotal !== undefined) {
        setMinTotal(parsed.minTotal);
      }
      if (parsed.maxTotal !== undefined) {
        setMaxTotal(parsed.maxTotal);
      }
    } catch (error) {
      console.warn('Failed to load setup from localStorage.', error);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  // Compute unique groups from components and ensure groupConfigs exist
  useEffect(() => {
    const newConfigs: Record<string, GroupConfig> = { ...groupConfigs };
    components.forEach((c) => {
      if (!newConfigs[c.group]) {
        newConfigs[c.group] = {
          name: c.group,
          minMass: null,
          maxMass: null,
          fixedMass: null,
          minCount: null,
          maxCount: null,
        };
      }
    });
    // Remove configs for groups no longer used
    Object.keys(newConfigs).forEach((key) => {
      if (!components.some((c) => c.group === key)) {
        delete newConfigs[key];
      }
    });
    setGroupConfigs(newConfigs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [components.map((c) => c.group).join('|')]);

  useEffect(() => {
    if (!isHydrated) return;
    const payload = {
      components,
      groupConfigs,
      minTotal,
      maxTotal,
    };
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  }, [components, groupConfigs, isHydrated, minTotal, maxTotal]);

  // Handler for updating component fields
  const updateComponent = useCallback(
    (id: string, field: keyof ComponentInput, value: string | number | null) => {
      setComponents((prev) =>
        prev.map((c) => (c.id === id ? { ...c, [field]: value } : c))
      );
    },
    []
  );

  // Handler for updating group configuration
  const updateGroupConfig = useCallback(
    (groupName: string, field: keyof GroupConfig, value: string | number | null) => {
      setGroupConfigs((prev) => {
        const updated = { ...prev };
        const current = updated[groupName];
        if (current) {
          // parse numbers or handle empty strings as null
          const num = value === '' || value === null ? null : Number(value);
          updated[groupName] = {
            ...current,
            [field]: isNaN(num) ? null : num,
          };
        }
        return updated;
      });
    },
    []
  );

  // Add a new component row
  const addComponent = () => {
    const newGroup = 'A';
    setComponents((prev) => [
      ...prev,
      {
        id: uid(),
        name: `Component ${prev.length + 1}`,
        group: newGroup,
        min: 0,
        max: 1,
        step: 0.1,
        fixed: null,
      },
    ]);
  };

  // Remove component
  const removeComponent = (id: string) => {
    setComponents((prev) => prev.filter((c) => c.id !== id));
  };

  const validateInputs = () => {
    if (minTotal === null || maxTotal === null) {
      setErrorMessage('Please fill in the total mass bounds before generating.');
      return false;
    }
    if (minTotal > maxTotal) {
      setErrorMessage('Minimum total must be less than or equal to maximum total.');
      return false;
    }
    for (const comp of components) {
      if (comp.min === null || comp.max === null || comp.step === null) {
        setErrorMessage('Please fill in all component min/max/step values before generating.');
        return false;
      }
      if (comp.step <= 0) {
        setErrorMessage('Step must be greater than 0 for all components.');
        return false;
      }
    }
    setErrorMessage('');
    return true;
  };

  // Generate combinations based on current state
  const generateCombinations = async () => {
    if (!validateInputs()) return;
    setGenerating(true);
    setProgress(0);
    setResults([]);
    // Build ranges for each component
    const ranges = components.map((comp) => {
      // Determine if fixed value is provided
      if (comp.fixed !== null && comp.fixed !== undefined && !isNaN(Number(comp.fixed))) {
        return [Number(comp.fixed)];
      }
      const step = comp.step ?? 0.1;
      const scale = Math.pow(
        10,
        Math.max(decimalPlaces(step), decimalPlaces(comp.min ?? 0), decimalPlaces(comp.max ?? 0))
      );
      const start = Math.round((comp.min ?? 0) * scale);
      const end = Math.round((comp.max ?? 0) * scale);
      const stepInt = Math.max(1, Math.round(step * scale));
      const vals: number[] = [];
      for (let v = start; v <= end; v += stepInt) {
        vals.push(roundValue(v / scale));
      }
      return vals.length > 0 ? vals : [roundValue(comp.min ?? 0)];
    });
    // Precompute total loops for progress estimation
    const totalLoops = ranges.reduce((acc, arr) => acc * arr.length, 1);
    let loopCounter = 0;
    const groupNames = Object.keys(groupConfigs);
    // Helper to recursively build combinations
    const resultsTemp: ResultRow[] = [];
    const helper = (
      index: number,
      currentValues: number[],
      groupMassSums: Record<string, number>,
      groupCounts: Record<string, number>,
      currentSum: number
    ) => {
      if (index === components.length) {
        // At leaf: allow totals within bounds
        if (currentSum >= (minTotal ?? 0) - epsilon && currentSum <= (maxTotal ?? 0) + epsilon) {
          // Check group-level min/fixed requirements
          let valid = true;
          for (const group of groupNames) {
            const cfg = groupConfigs[group];
            const mass = groupMassSums[group] ?? 0;
            const cnt = groupCounts[group] ?? 0;
            if (cfg.fixedMass !== null && cfg.fixedMass !== undefined) {
              if (Math.abs(mass - cfg.fixedMass) > epsilon) {
                valid = false;
                break;
              }
            }
            if (cfg.minMass !== null && cfg.minMass !== undefined) {
              if (mass < cfg.minMass - epsilon) {
                valid = false;
                break;
              }
            }
            if (cfg.minCount !== null && cfg.minCount !== undefined) {
              if (cnt < cfg.minCount) {
                valid = false;
                break;
              }
            }
            if (cfg.maxMass !== null && cfg.maxMass !== undefined) {
              if (mass > cfg.maxMass + epsilon) {
                valid = false;
                break;
              }
            }
            if (cfg.maxCount !== null && cfg.maxCount !== undefined) {
              if (cnt > cfg.maxCount) {
                valid = false;
                break;
              }
            }
          }
          if (valid) {
            const row: ResultRow = {};
            components.forEach((comp, i) => {
              row[comp.name] = currentValues[i];
            });
            resultsTemp.push(row);
          }
        }
        return;
      }
      const comp = components[index];
      const group = comp.group;
      for (const val of ranges[index]) {
        loopCounter++;
        // Update progress occasionally
        if (loopCounter % 100 === 0) {
          setProgress(Math.min(100, (loopCounter / totalLoops) * 100));
        }
        const newSum = roundValue(currentSum + val);
        // Early skip if sum exceeds max total
        if (newSum > (maxTotal ?? 0) + epsilon) continue;
        // Copy groupMassSums and groupCounts to avoid mutation
        const gm = { ...groupMassSums };
        const gc = { ...groupCounts };
        // Update group metrics if value is non-zero
        if (val > 0) {
          gm[group] = (gm[group] ?? 0) + val;
          gc[group] = (gc[group] ?? 0) + 1;
        }
        const cfg = groupConfigs[group];
        // Check maxMass and fixedMass early
        if (cfg.fixedMass !== null && cfg.fixedMass !== undefined) {
          if (gm[group] > cfg.fixedMass + epsilon) continue;
        }
        if (cfg.maxMass !== null && cfg.maxMass !== undefined) {
          if (gm[group] > cfg.maxMass + epsilon) continue;
        }
        // Check maxCount
        if (cfg.maxCount !== null && cfg.maxCount !== undefined) {
          if (gc[group] > cfg.maxCount) continue;
        }
        helper(index + 1, [...currentValues, val], gm, gc, newSum);
      }
    };
    helper(0, [], {}, {}, 0);
    // After generation
    setProgress(100);
    setResults(resultsTemp);
    setGenerating(false);
  };

  // Export results to CSV
  const exportCSV = () => {
    if (results.length === 0) return;
    const headers = Object.keys(results[0]);
    const lines = [];
    lines.push(headers.join(','));
    results.forEach((row) => {
      const vals = headers.map((h) => String(row[h] ?? ''));
      lines.push(vals.join(','));
    });
    const csvContent = lines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'combinations.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="container mx-auto max-w-6xl p-4 md:p-8 space-y-8">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Formula Combination Generator</h1>
            <p className="text-sm text-neutral-300">
              Configure component ranges and group rules to generate combinations.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-neutral-300">
              <span>Input units</span>
              <div className="flex rounded-full border border-white/10 bg-white/5 p-1">
                <button
                  type="button"
                  className={`px-3 py-1 text-xs font-semibold ${
                    inputUnit === 'ratio'
                      ? 'rounded-full bg-red-600 text-white'
                      : 'text-neutral-300'
                  }`}
                  onClick={() => setInputUnit('ratio')}
                >
                  0-1
                </button>
                <button
                  type="button"
                  className={`px-3 py-1 text-xs font-semibold ${
                    inputUnit === 'percent'
                      ? 'rounded-full bg-red-600 text-white'
                      : 'text-neutral-300'
                  }`}
                  onClick={() => setInputUnit('percent')}
                >
                  %
                </button>
              </div>
            </div>
            <button
              onClick={generateCombinations}
              disabled={generating}
              className="rounded-md bg-red-600 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-red-500 disabled:opacity-50"
            >
              {generating ? 'Generating...' : 'Generate Combinations'}
            </button>
            {results.length > 0 && (
              <button
                onClick={exportCSV}
                className="rounded-md border border-white/15 bg-white/10 px-5 py-2 text-sm font-semibold text-white hover:bg-white/20"
              >
                Export CSV
              </button>
            )}
          </div>
        </header>

        {errorMessage && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {errorMessage}
          </div>
        )}

        <div className="space-y-6">
          <div className="space-y-6 rounded-2xl border border-white/10 bg-neutral-900/60 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Components</h2>
                <p className="text-sm text-neutral-400">
                  Define each component with min/max limits and step precision.
                </p>
              </div>
              <button
                onClick={addComponent}
                className="flex items-center gap-1 text-sm font-semibold text-red-300 hover:text-red-200"
              >
                <Plus size={18} /> Add Component
              </button>
            </div>

            {/* Components table */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-white/10 text-sm">
                <thead className="bg-white/5 text-xs uppercase tracking-wider text-neutral-300">
                  <tr>
                    <th className="px-4 py-2 text-left">Name</th>
                    <th className="px-4 py-2 text-left">Group</th>
                    <th className="px-4 py-2 text-left">Min</th>
                    <th className="px-4 py-2 text-left">Max</th>
                    <th className="px-4 py-2 text-left">Step</th>
                    <th className="px-4 py-2 text-left">Fixed</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {components.map((comp) => (
                    <tr key={comp.id}>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          className={`${inputBase} w-36`}
                          value={comp.name}
                          onChange={(e) => updateComponent(comp.id, 'name', e.target.value)}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          className={`${inputCenter} w-16`}
                          value={comp.group}
                          onChange={(e) =>
                            updateComponent(comp.id, 'group', e.target.value.toUpperCase())
                          }
                        />
                      </td>
                <td className="px-4 py-2">
                      <input
                        type="number"
                        className={`${inputRight} w-20`}
                        value={formatInputValue(comp.min)}
                        min={inputMin}
                        max={inputMax}
                        step={inputStep}
                        onChange={(e) => {
                          updateComponent(comp.id, 'min', parseInputValue(e.target.value));
                        }}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        className={`${inputRight} w-20`}
                        value={formatInputValue(comp.max)}
                        min={inputMin}
                        max={inputMax}
                        step={inputStep}
                        onChange={(e) => {
                          updateComponent(comp.id, 'max', parseInputValue(e.target.value));
                        }}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        className={`${inputRight} w-20`}
                        value={formatInputValue(comp.step)}
                        min={inputStep}
                        max={inputMax}
                        step={inputStep}
                        onChange={(e) => {
                          updateComponent(comp.id, 'step', parseInputValue(e.target.value));
                        }}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        className={`${inputRight} w-20`}
                        min={inputMin}
                        max={inputMax}
                        step={inputStep}
                        value={formatInputValue(comp.fixed ?? null)}
                        onChange={(e) => {
                          updateComponent(comp.id, 'fixed', parseInputValue(e.target.value));
                        }}
                        placeholder="--"
                      />
                    </td>
                      <td className="px-4 py-2 text-center">
                        {components.length > 1 && (
                          <button
                            className="text-red-400 hover:text-red-300"
                            onClick={() => removeComponent(comp.id)}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-neutral-900/60 p-6">
            <h2 className="text-lg font-semibold">Total Mass Bounds</h2>
            <p className="text-sm text-neutral-400">
              Allow totals between your chosen minimum and maximum range.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <input
                type="number"
                className={`${inputRight} w-24`}
                value={formatInputValue(minTotal)}
                min={inputMin}
                max={inputUnit === 'percent' ? 150 : 1.5}
                step={inputStep}
                onChange={(e) => {
                  setMinTotal(parseInputValue(e.target.value));
                }}
                placeholder="Min"
              />
              <span className="text-sm text-neutral-400">to</span>
              <input
                type="number"
                className={`${inputRight} w-24`}
                value={formatInputValue(maxTotal)}
                min={inputMin}
                max={inputUnit === 'percent' ? 150 : 1.5}
                step={inputStep}
                onChange={(e) => {
                  setMaxTotal(parseInputValue(e.target.value));
                }}
                placeholder="Max"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-neutral-900/60 p-6">
            <h2 className="text-lg font-semibold">Group Constraints</h2>
            <p className="text-sm text-neutral-400">
              Configure mass and count constraints for each group.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-white/10 text-sm">
                <thead className="bg-white/5 text-xs uppercase tracking-wider text-neutral-300">
                  <tr>
                    <th className="px-4 py-2 text-left">Group</th>
                    <th className="px-4 py-2 text-left">Min Mass</th>
                    <th className="px-4 py-2 text-left">Max Mass</th>
                    <th className="px-4 py-2 text-left">Fixed Mass</th>
                    <th className="px-4 py-2 text-left">Min Count</th>
                    <th className="px-4 py-2 text-left">Max Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {Object.keys(groupConfigs).map((groupName) => {
                    const cfg = groupConfigs[groupName];
                    return (
                      <tr key={groupName}>
                        <td className="px-4 py-2 font-medium text-white">{groupName}</td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            className={`${inputRight} w-20`}
                            value={formatInputValue(cfg.minMass ?? null)}
                            min={inputMin}
                            max={inputMax}
                            step={inputStep}
                            onChange={(e) =>
                              updateGroupConfig(groupName, 'minMass', parseInputValue(e.target.value))
                            }
                            placeholder="--"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            className={`${inputRight} w-20`}
                            value={formatInputValue(cfg.maxMass ?? null)}
                            min={inputMin}
                            max={inputMax}
                            step={inputStep}
                            onChange={(e) =>
                              updateGroupConfig(groupName, 'maxMass', parseInputValue(e.target.value))
                            }
                            placeholder="--"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            className={`${inputRight} w-20`}
                            value={formatInputValue(cfg.fixedMass ?? null)}
                            min={inputMin}
                            max={inputMax}
                            step={inputStep}
                            onChange={(e) =>
                              updateGroupConfig(groupName, 'fixedMass', parseInputValue(e.target.value))
                            }
                            placeholder="--"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            className={`${inputRight} w-16`}
                            value={cfg.minCount ?? ''}
                            onChange={(e) => updateGroupConfig(groupName, 'minCount', e.target.value)}
                            placeholder="--"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            className={`${inputRight} w-16`}
                            value={cfg.maxCount ?? ''}
                            onChange={(e) => updateGroupConfig(groupName, 'maxCount', e.target.value)}
                            placeholder="--"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        {/* Progress bar */}
        {generating && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-red-200">
              <span className="inline-flex h-3 w-3 animate-ping rounded-full bg-red-400 opacity-70"></span>
              <span>Calculating combinations… {progress.toFixed(1)}%</span>
            </div>
            <div className="w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-2 rounded-full bg-red-500 transition-all"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-neutral-900/60 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">
                Generated Combinations <span className="text-red-300">({results.length})</span>
              </h2>
              <div className="flex items-center gap-2 text-sm text-neutral-300">
                <span>Display</span>
                <div className="flex rounded-full border border-white/10 bg-white/5 p-1">
                  <button
                    type="button"
                    className={`px-3 py-1 text-xs font-semibold ${
                      resultUnit === 'ratio'
                        ? 'rounded-full bg-red-600 text-white'
                        : 'text-neutral-300'
                    }`}
                    onClick={() => setResultUnit('ratio')}
                  >
                    0-1
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-1 text-xs font-semibold ${
                      resultUnit === 'percent'
                        ? 'rounded-full bg-red-600 text-white'
                        : 'text-neutral-300'
                    }`}
                    onClick={() => setResultUnit('percent')}
                  >
                    %
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-4 overflow-x-auto max-h-96 rounded-lg border border-white/10">
              <table className="min-w-full divide-y divide-white/10 text-sm">
                <thead className="sticky top-0 bg-neutral-900 text-xs uppercase tracking-wider text-neutral-300">
                  <tr>
                    {Object.keys(results[0]).map((header) => (
                      <th key={header} className="px-4 py-2 text-left">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-neutral-100">
                  {results.map((row, rowIndex) => (
                    <tr key={rowIndex} className="hover:bg-white/5">
                      {Object.keys(row).map((key) => (
                        <td key={key} className="px-4 py-1 whitespace-nowrap text-right">
                          {resultUnit === 'percent'
                            ? `${(row[key] * 100).toFixed(1)}%`
                            : row[key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
