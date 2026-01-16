"use client";

import { useState, useMemo, useCallback, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';

interface ComponentInput {
  id: string;
  name: string;
  group: string;
  min: number;
  max: number;
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
      fixed: null,
    },
  ]);
  // Group config state keyed by group name
  const [groupConfigs, setGroupConfigs] = useState<Record<string, GroupConfig>>({
    A: { name: 'A', minMass: null, maxMass: null, fixedMass: null, minCount: null, maxCount: null },
  });
  // Step size on 0-1 scale
  const [step, setStep] = useState<number>(0.1);
  // Generation state
  const [generating, setGenerating] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [isHydrated, setIsHydrated] = useState<boolean>(false);

  const storageKey = 'combinationAppSetup';
  const epsilon = 1e-9;
  const roundValue = (value: number) => Number(value.toFixed(6));

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
        step?: number;
      };
      if (parsed.components && parsed.components.length > 0) {
        setComponents(parsed.components);
      }
      if (parsed.groupConfigs && Object.keys(parsed.groupConfigs).length > 0) {
        setGroupConfigs(parsed.groupConfigs);
      }
      if (typeof parsed.step === 'number' && !Number.isNaN(parsed.step)) {
        setStep(parsed.step);
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
      step,
    };
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  }, [components, groupConfigs, step, isHydrated]);

  // Handler for updating component fields
  const updateComponent = useCallback(
    (id: string, field: keyof ComponentInput, value: string | number) => {
      setComponents((prev) =>
        prev.map((c) => (c.id === id ? { ...c, [field]: value } : c))
      );
    },
    []
  );

  // Handler for updating group configuration
  const updateGroupConfig = useCallback(
    (groupName: string, field: keyof GroupConfig, value: string | number) => {
      setGroupConfigs((prev) => {
        const updated = { ...prev };
        const current = updated[groupName];
        if (current) {
          // parse numbers or handle empty strings as null
          const num = value === '' ? null : Number(value);
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
        fixed: null,
      },
    ]);
  };

  // Remove component
  const removeComponent = (id: string) => {
    setComponents((prev) => prev.filter((c) => c.id !== id));
  };

  // Generate combinations based on current state
  const generateCombinations = async () => {
    setGenerating(true);
    setProgress(0);
    setResults([]);
    // Build ranges for each component
    const ranges = components.map((comp) => {
      // Determine if fixed value is provided
      if (comp.fixed !== null && comp.fixed !== undefined && !isNaN(Number(comp.fixed))) {
        return [Number(comp.fixed)];
      }
      const vals: number[] = [];
      for (let v = comp.min; v <= comp.max + epsilon; v += step) {
        vals.push(roundValue(v));
      }
      return vals;
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
        // At leaf: check if total sum equals 1
        if (Math.abs(currentSum - 1) <= epsilon) {
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
        // Early skip if sum exceeds 1
        if (newSum > 1 + epsilon) continue;
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
    <div className="container mx-auto max-w-5xl p-4 space-y-6">
      <h1 className="text-3xl font-bold">Formula Combination Generator</h1>
      {/* Step size input */}
      <div className="flex flex-col md:flex-row gap-4 items-center">
        <label className="font-medium">Step (0-1 scale):</label>
        <input
          type="number"
          className="border rounded p-2 w-24"
          min={0.01}
          max={1}
          step={0.01}
          value={step}
          onChange={(e) => setStep(parseFloat(e.target.value) || 0.01)}
        />
        <button
          onClick={generateCombinations}
          disabled={generating}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {generating ? 'Generating...' : 'Generate Combinations'}
        </button>
        {results.length > 0 && (
          <button
            onClick={exportCSV}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            Export CSV
          </button>
        )}
      </div>
      {/* Progress bar */}
      {generating && (
        <div className="w-full bg-gray-200 rounded h-4 overflow-hidden">
          <div
            className="bg-blue-500 h-4 transition-all"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
      )}
      {/* Components table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Group
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Min
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Max
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Fixed
              </th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {components.map((comp) => (
              <tr key={comp.id}>
                <td className="px-4 py-2">
                  <input
                    type="text"
                    className="border rounded p-1 w-32"
                    value={comp.name}
                    onChange={(e) => updateComponent(comp.id, 'name', e.target.value)}
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="text"
                    className="border rounded p-1 w-16 text-center"
                    value={comp.group}
                    onChange={(e) => updateComponent(comp.id, 'group', e.target.value.toUpperCase())}
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    className="border rounded p-1 w-20 text-right"
                    value={comp.min}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(e) => updateComponent(comp.id, 'min', parseFloat(e.target.value) || 0)}
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    className="border rounded p-1 w-20 text-right"
                    value={comp.max}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(e) => updateComponent(comp.id, 'max', parseFloat(e.target.value) || 0)}
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    className="border rounded p-1 w-20 text-right"
                    min={0}
                    max={1}
                    step={0.01}
                    value={comp.fixed ?? ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      updateComponent(comp.id, 'fixed', val === '' ? null : parseFloat(val));
                    }}
                    placeholder="--"
                  />
                </td>
                <td className="px-4 py-2 text-center">
                  {components.length > 1 && (
                    <button
                      className="text-red-600 hover:text-red-800"
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
      <button
        onClick={addComponent}
        className="flex items-center gap-1 text-blue-600 hover:text-blue-800"
      >
        <Plus size={18} /> Add Component
      </button>

      {/* Group configuration */}
      <div className="mt-8">
        <h2 className="text-2xl font-semibold mb-2">Group Constraints</h2>
        <p className="text-sm text-gray-500 mb-4">
          Configure mass (0-1 scale) and count constraints for each group. Leave fields blank for no
          constraint.
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Group
                </th>
                <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Min Mass
                </th>
                <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Max Mass
                </th>
                <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fixed Mass
                </th>
                <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Min Count
                </th>
                <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Max Count
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {Object.keys(groupConfigs).map((groupName) => {
                const cfg = groupConfigs[groupName];
                return (
                  <tr key={groupName}>
                    <td className="px-4 py-2 font-medium text-gray-700">{groupName}</td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        className="border rounded p-1 w-24 text-right"
                        value={cfg.minMass ?? ''}
                        min={0}
                        max={1}
                        step={0.01}
                        onChange={(e) => updateGroupConfig(groupName, 'minMass', e.target.value)}
                        placeholder="--"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        className="border rounded p-1 w-24 text-right"
                        value={cfg.maxMass ?? ''}
                        min={0}
                        max={1}
                        step={0.01}
                        onChange={(e) => updateGroupConfig(groupName, 'maxMass', e.target.value)}
                        placeholder="--"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        className="border rounded p-1 w-24 text-right"
                        value={cfg.fixedMass ?? ''}
                        min={0}
                        max={1}
                        step={0.01}
                        onChange={(e) => updateGroupConfig(groupName, 'fixedMass', e.target.value)}
                        placeholder="--"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        className="border rounded p-1 w-24 text-right"
                        value={cfg.minCount ?? ''}
                        onChange={(e) => updateGroupConfig(groupName, 'minCount', e.target.value)}
                        placeholder="--"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        className="border rounded p-1 w-24 text-right"
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

      {/* Results */}
      {results.length > 0 && (
        <div className="mt-8">
          <h2 className="text-2xl font-semibold mb-2">Generated Combinations ({results.length})</h2>
          <div className="overflow-x-auto max-h-96 border rounded">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {Object.keys(results[0]).map((header) => (
                    <th
                      key={header}
                      className="px-4 py-2 text-left font-medium text-gray-700 whitespace-nowrap"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {results.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {Object.keys(row).map((key) => (
                      <td key={key} className="px-4 py-1 whitespace-nowrap text-right">
                        {row[key]}
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
  );
}
