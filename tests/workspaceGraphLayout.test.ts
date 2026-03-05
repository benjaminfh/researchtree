import { describe, expect, it } from 'vitest';
import {
  computeLabelTranslateX,
  computeRowRightMostLanes,
  countCrossings,
  type EdgeLayoutSegment
} from '@/src/components/workspace/WorkspaceGraph';

describe('workspace graph layout helpers', () => {
  it('counts pairwise edge crossings when lane ordering flips', () => {
    const segments: EdgeLayoutSegment[] = [
      { sourceRow: 0, targetRow: 2, sourceLane: 0, targetLane: 2 },
      { sourceRow: 0, targetRow: 2, sourceLane: 2, targetLane: 0 }
    ];
    expect(countCrossings(segments)).toBe(1);
  });

  it('does not count crossing when relative lane ordering is preserved', () => {
    const segments: EdgeLayoutSegment[] = [
      { sourceRow: 0, targetRow: 2, sourceLane: 0, targetLane: 1 },
      { sourceRow: 0, targetRow: 2, sourceLane: 2, targetLane: 3 }
    ];
    expect(countCrossings(segments)).toBe(0);
  });

  it('computes right-most row occupancy from node lanes and traversing edges', () => {
    const rows = 4;
    const nodeLanes = [0, 1, 0, 2];
    const segments: EdgeLayoutSegment[] = [{ sourceRow: 0, targetRow: 3, sourceLane: 0, targetLane: 2 }];
    expect(computeRowRightMostLanes(rows, nodeLanes, segments)).toEqual([2, 2, 2, 2]);
  });

  it('keeps labels unshifted when already on the anchor lane', () => {
    expect(computeLabelTranslateX(3, 3)).toBe(0);
  });

  it('adds positive translation when a row anchor is to the right', () => {
    expect(computeLabelTranslateX(1, 3)).toBeGreaterThan(0);
  });
});
