// Tests for the geometry construction / constraint logic in state.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
    createInitialState,
    addPoint,
    addSegmentTwoPoints,
    addSegmentAbsAngle,
    addSegmentRelAngle,
    getSegmentAngle,
    addCircleRadius,
    addCircleCircumference,
    addCircleThreePoints,
    deleteEntity,
    setActiveTool,
    findAllIntersections,
} from './state';
import type { GeometryState } from './types';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);

let state: GeometryState;

beforeEach(() => {
    state = createInitialState();
});

// ============ CONSTRUCTION ============

describe('point creation', () => {
    it('adds a point to the state with unique ids and labels', () => {
        const a = addPoint(state, 0, 0);
        const b = addPoint(state, 1, 1);
        expect(state.points.size).toBe(2);
        expect(a.id).not.toBe(b.id);
        expect(a.label).not.toBe(b.label);
        expect(a).toMatchObject({ x: 0, y: 0, childrenIds: [] });
    });

    it('assigns distinct labels beyond the first alphabet cycle', () => {
        const labels = new Set<string>();
        for (let i = 0; i < 30; i++) labels.add(addPoint(state, i, i).label);
        expect(labels.size).toBe(30);
    });
});

describe('segment construction', () => {
    it('creates a two-point segment and registers it in both parents', () => {
        const p1 = addPoint(state, 0, 0);
        const p2 = addPoint(state, 10, 0);
        const seg = addSegmentTwoPoints(state, p1.id, p2.id);
        expect(seg).not.toBeNull();
        expect(state.segments.size).toBe(1);
        expect(p1.childrenIds).toContain(seg!.id);
        expect(p2.childrenIds).toContain(seg!.id);
    });

    it('returns null when an endpoint is missing', () => {
        const p1 = addPoint(state, 0, 0);
        expect(addSegmentTwoPoints(state, p1.id, 'missing')).toBeNull();
        expect(state.segments.size).toBe(0);
    });

    it('abs-angle 90 degrees goes straight up in screen coords (y negated)', () => {
        const p1 = addPoint(state, 0, 0);
        const { newPoint: p2 } = addSegmentAbsAngle(state, p1.id, 90, 10)!;
        expect(p2.x).toBeCloseTo(0);
        expect(p2.y).toBeCloseTo(-10);
    });

    it('abs-angle 0 degrees goes straight right', () => {
        const p1 = addPoint(state, 5, 5);
        const { newPoint: p2 } = addSegmentAbsAngle(state, p1.id, 0, 4)!;
        expect(p2.x).toBeCloseTo(9);
        expect(p2.y).toBeCloseTo(5);
    });

    it('rel-angle resolves against the reference segment angle', () => {
        // Horizontal reference segment (angle 0)
        const p1 = addPoint(state, 0, 0);
        const p1b = addPoint(state, 10, 0);
        const ref = addSegmentTwoPoints(state, p1.id, p1b.id)!;

        const { newPoint: p2 } = addSegmentRelAngle(state, p1.id, ref.id, 90, 5)!;
        // Final angle 90 => up in screen coords
        expect(p2.x).toBeCloseTo(0);
        expect(p2.y).toBeCloseTo(-5);

        // refAngle + relAngle for a downsloping ref (angle -90): rel 90 => angle 0 (right)
        const { newPoint: p3 } = addSegmentRelAngle(state, p1.id, ref.id, 0, 3)!;
        expect(p3.x).toBeCloseTo(3);
        expect(p3.y).toBeCloseTo(0);
    });

    it('rel-angle returns null for a missing reference segment', () => {
        const p1 = addPoint(state, 0, 0);
        expect(addSegmentRelAngle(state, p1.id, 'nope', 45, 5)).toBeNull();
    });

    it('reports segment angles with y-negation (up = positive degrees)', () => {
        const p1 = addPoint(state, 0, 0);
        const up = addPoint(state, 3, -3);
        const down = addPoint(state, 3, 3);
        expect(getSegmentAngle(state, { id: 's', p1: p1.id, p2: up.id, type: 'TWO_POINTS', childrenIds: [] })).toBeCloseTo(45);
        expect(getSegmentAngle(state, { id: 's', p1: p1.id, p2: down.id, type: 'TWO_POINTS', childrenIds: [] })).toBeCloseTo(-45);
    });
});

describe('circle construction', () => {
    it('creates a radius circle around an existing center', () => {
        const c = addPoint(state, 0, 0);
        const circle = addCircleRadius(state, c.id, 5)!;
        expect(circle.centerId).toBe(c.id);
        expect(circle.radius).toBe(5);
        expect(c.childrenIds).toContain(circle.id);
    });

    it('radius circle returns null for a missing center', () => {
        expect(addCircleRadius(state, 'missing', 5)).toBeNull();
    });

    it('circumference circle derives the radius from the circum point', () => {
        const c = addPoint(state, 0, 0);
        const p = addPoint(state, 3, 4);
        const circle = addCircleCircumference(state, c.id, p.id)!;
        expect(circle.radius).toBeCloseTo(5);
        expect(circle.pointIds).toContain(p.id);
    });

    it('three-point circle produces a center equidistant from all three points', () => {
        const p1 = addPoint(state, 0, 0);
        const p2 = addPoint(state, 4, 0);
        const p3 = addPoint(state, 0, 4);
        const { circle, centerPoint } = addCircleThreePoints(state, p1.id, p2.id, p3.id)!;
        expect(circle.type).toBe('THREE_POINTS');
        for (const p of [p1, p2, p3]) {
            expect(dist(centerPoint, p)).toBeCloseTo(circle.radius!);
        }
        // Center of the right triangle with legs 4 is at (2, 2)
        expect(centerPoint.x).toBeCloseTo(2);
        expect(centerPoint.y).toBeCloseTo(2);
    });

    it('three-point circle returns null for collinear (degenerate) points', () => {
        const p1 = addPoint(state, 0, 0);
        const p2 = addPoint(state, 1, 1);
        const p3 = addPoint(state, 2, 2);
        const before = state.points.size;
        expect(addCircleThreePoints(state, p1.id, p2.id, p3.id)).toBeNull();
        expect(state.circles.size).toBe(0);
        // Should not have created a stray center point
        expect(state.points.size).toBe(before);
    });

    it('three-point circle returns null for coincident points', () => {
        const p1 = addPoint(state, 1, 1);
        const p2 = addPoint(state, 1, 1);
        const p3 = addPoint(state, 1, 1);
        expect(addCircleThreePoints(state, p1.id, p2.id, p3.id)).toBeNull();
    });

    it('three-point circle returns null when any point is missing', () => {
        const p1 = addPoint(state, 0, 0);
        const p2 = addPoint(state, 4, 0);
        expect(addCircleThreePoints(state, p1.id, p2.id, 'missing')).toBeNull();
    });
});

// ============ CASCADING DELETE ============

describe('cascading delete', () => {
    it('deletes a segment without touching its endpoints', () => {
        const p1 = addPoint(state, 0, 0);
        const p2 = addPoint(state, 1, 0);
        const seg = addSegmentTwoPoints(state, p1.id, p2.id)!;
        deleteEntity(state, seg.id);
        expect(state.segments.size).toBe(0);
        expect(state.points.size).toBe(2);
        expect(p1.childrenIds).not.toContain(seg.id);
        expect(p2.childrenIds).not.toContain(seg.id);
    });

    it('deleting a segment endpoint leaves the other endpoint intact', () => {
        const p1 = addPoint(state, 0, 0);
        const p2 = addPoint(state, 1, 0);
        addSegmentTwoPoints(state, p1.id, p2.id);
        deleteEntity(state, p1.id);
        expect(state.points.size).toBe(1);
        expect(state.segments.size).toBe(0);
        expect(p2.childrenIds).toEqual([]);
    });

    it('deleting one boundary point of a three-point circle removes the circle and its auto-created center', () => {
        const p1 = addPoint(state, 0, 0);
        const p2 = addPoint(state, 4, 0);
        const p3 = addPoint(state, 0, 4);
        const { centerPoint } = addCircleThreePoints(state, p1.id, p2.id, p3.id)!;
        deleteEntity(state, p1.id);
        expect(state.circles.size).toBe(0);
        // The center was created for this circle, so the cascade must reach it too
        expect(state.points.has(centerPoint.id)).toBe(false);
        expect(state.points.size).toBe(2); // p2 and p3 remain
        expect(p2.childrenIds).toEqual([]);
        expect(p3.childrenIds).toEqual([]);
    });

    it('deleting a boundary point of a radius circle keeps the user-created center', () => {
        const center = addPoint(state, 0, 0);
        const onEdge = addPoint(state, 4, 0);
        addCircleCircumference(state, center.id, onEdge.id);
        deleteEntity(state, onEdge.id);
        // One point still on the circle rim would be a user point; the center
        // definitely is, so it must survive the circle's cascade.
        expect(state.circles.size).toBe(0);
        expect(state.points.has(center.id)).toBe(true);
    });

    it('deleting a circle center removes only the circle, not boundary points', () => {
        const p1 = addPoint(state, 0, 0);
        const p2 = addPoint(state, 4, 0);
        const p3 = addPoint(state, 0, 4);
        const { centerPoint } = addCircleThreePoints(state, p1.id, p2.id, p3.id)!;
        deleteEntity(state, centerPoint.id);
        expect(state.circles.size).toBe(0);
        expect(state.points.has(p1.id)).toBe(true);
        expect(state.points.has(p2.id)).toBe(true);
        expect(state.points.has(p3.id)).toBe(true);
    });

    it('deleteEntity on an unknown id is a no-op', () => {
        const p = addPoint(state, 0, 0);
        deleteEntity(state, 'ghost');
        expect(state.points.size).toBe(1);
        expect(state.points.has(p.id)).toBe(true);
    });
});

// ============ TOOL / HISTORY STATE ============

describe('tool and measure history', () => {
    it('changing the active tool clears selection and measure history', () => {
        const p = addPoint(state, 0, 0);
        state.selectedIds = [p.id];
        setActiveTool(state, 'CIRCLE');
        expect(state.activeTool).toBe('CIRCLE');
        expect(state.selectedIds).toEqual([]);
        expect(state.measureHistory).toEqual([]);
    });
});

// ============ INTERSECTION SOLVER ============

describe('segment-segment intersections', () => {
    it('finds the crossing point of two segments', () => {
        const a1 = addPoint(state, -5, 0);
        const a2 = addPoint(state, 5, 0);
        const b1 = addPoint(state, 0, -5);
        const b2 = addPoint(state, 0, 5);
        addSegmentTwoPoints(state, a1.id, a2.id);
        addSegmentTwoPoints(state, b1.id, b2.id);
        const found = findAllIntersections(state);
        expect(found).toHaveLength(1);
        expect(found[0].x).toBeCloseTo(0);
        expect(found[0].y).toBeCloseTo(0);
        expect(state.points.size).toBe(5);
    });

    it('finds no intersection for parallel segments', () => {
        const a1 = addPoint(state, -5, 1);
        const a2 = addPoint(state, 5, 1);
        const b1 = addPoint(state, -5, -1);
        const b2 = addPoint(state, 5, -1);
        addSegmentTwoPoints(state, a1.id, a2.id);
        addSegmentTwoPoints(state, b1.id, b2.id);
        expect(findAllIntersections(state)).toHaveLength(0);
    });

    it('finds no intersection for non-overlapping segments on the same line', () => {
        const a1 = addPoint(state, 0, 0);
        const a2 = addPoint(state, 1, 0);
        const b1 = addPoint(state, 2, 0);
        const b2 = addPoint(state, 3, 0);
        addSegmentTwoPoints(state, a1.id, a2.id);
        addSegmentTwoPoints(state, b1.id, b2.id);
        expect(findAllIntersections(state)).toHaveLength(0);
    });

    it('ignores segments that only touch at a shared endpoint', () => {
        const a1 = addPoint(state, -5, 0);
        const tip = addPoint(state, 0, 0);
        const b1 = addPoint(state, 0, 5);
        addSegmentTwoPoints(state, a1.id, tip.id);
        addSegmentTwoPoints(state, tip.id, b1.id);
        expect(findAllIntersections(state)).toHaveLength(0);
    });

    it('does not duplicate a point already at the crossing location', () => {
        const a1 = addPoint(state, -5, 0);
        const a2 = addPoint(state, 5, 0);
        const b1 = addPoint(state, 0, -5);
        const b2 = addPoint(state, 0, 5);
        addSegmentTwoPoints(state, a1.id, a2.id);
        addSegmentTwoPoints(state, b1.id, b2.id);
        addPoint(state, 0, 0); // pre-existing point exactly at the crossing
        const found = findAllIntersections(state);
        expect(found).toHaveLength(0);
        expect(state.points.size).toBe(5);
    });
});

describe('segment-circle intersections', () => {
    it('finds two crossing points for a segment through a circle', () => {
        const c = addPoint(state, 0, 0);
        addCircleRadius(state, c.id, 2);
        const s1 = addPoint(state, -5, 0.5);
        const s2 = addPoint(state, 5, 0.5);
        addSegmentTwoPoints(state, s1.id, s2.id);
        const found = findAllIntersections(state);
        expect(found).toHaveLength(2);
        for (const pt of found) {
            expect(Math.hypot(pt.x, pt.y)).toBeCloseTo(2);
            expect(pt.y).toBeCloseTo(0.5);
        }
        // Crossings are symmetric about x = 0
        expect(found[0].x + found[1].x).toBeCloseTo(0);
    });

    it('finds exactly one tangent point', () => {
        const c = addPoint(state, 0, 0);
        addCircleRadius(state, c.id, 2);
        const s1 = addPoint(state, -5, 2);
        const s2 = addPoint(state, 5, 2);
        addSegmentTwoPoints(state, s1.id, s2.id);
        const found = findAllIntersections(state);
        expect(found).toHaveLength(1);
        expect(found[0].x).toBeCloseTo(0);
        expect(found[0].y).toBeCloseTo(2);
    });

    it('finds no intersection when the segment misses the circle', () => {
        const c = addPoint(state, 0, 0);
        addCircleRadius(state, c.id, 1);
        const s1 = addPoint(state, -5, 3);
        const s2 = addPoint(state, 5, 3);
        addSegmentTwoPoints(state, s1.id, s2.id);
        expect(findAllIntersections(state)).toHaveLength(0);
    });

    it('ignores circle data that is incomplete', () => {
        // A circle whose center point was deleted from underneath it must not crash
        const c = addPoint(state, 0, 0);
        const circle = addCircleRadius(state, c.id, 1)!;
        // Construct a segment that would intersect if the circle were valid
        const s1 = addPoint(state, -5, 0);
        const s2 = addPoint(state, 5, 0);
        addSegmentTwoPoints(state, s1.id, s2.id);
        // Simulate the dangling-center case by pointing the circle at a removed center
        circle.centerId = 'deleted';
        expect(findAllIntersections(state)).toHaveLength(0);
    });
});

describe('circle-circle intersections', () => {
    it('finds two intersections for two overlapping circles', () => {
        const c1 = addPoint(state, 0, 0);
        const c2 = addPoint(state, 3, 0);
        addCircleRadius(state, c1.id, 2);
        addCircleRadius(state, c2.id, 2);
        const found = findAllIntersections(state);
        expect(found).toHaveLength(2);
        for (const pt of found) {
            expect(dist(pt, c1)).toBeCloseTo(2);
            expect(dist(pt, c2)).toBeCloseTo(2);
        }
    });

    it('finds one intersection for externally tangent circles', () => {
        const c1 = addPoint(state, 0, 0);
        const c2 = addPoint(state, 5, 0);
        addCircleRadius(state, c1.id, 2);
        addCircleRadius(state, c2.id, 3);
        const found = findAllIntersections(state);
        expect(found).toHaveLength(1);
        expect(found[0].x).toBeCloseTo(2);
        expect(found[0].y).toBeCloseTo(0);
    });

    it('finds no intersection when one circle contains the other', () => {
        const c1 = addPoint(state, 0, 0);
        const c2 = addPoint(state, 0, 0.5);
        addCircleRadius(state, c1.id, 5);
        addCircleRadius(state, c2.id, 1);
        expect(findAllIntersections(state)).toHaveLength(0);
    });

    it('finds no intersection for disjoint circles', () => {
        const c1 = addPoint(state, 0, 0);
        const c2 = addPoint(state, 10, 0);
        addCircleRadius(state, c1.id, 2);
        addCircleRadius(state, c2.id, 3);
        expect(findAllIntersections(state)).toHaveLength(0);
    });

    it('finds no intersection for coincident circles (infinite solutions)', () => {
        const c1 = addPoint(state, 0, 0);
        const c2 = addPoint(state, 0, 0);
        addCircleRadius(state, c1.id, 2);
        addCircleRadius(state, c2.id, 2);
        expect(findAllIntersections(state)).toHaveLength(0);
    });
});

describe('solver stability and idempotence', () => {
    it('resolves a grid of crossing segments once, then a second pass finds nothing new', () => {
        const N = 5;
        for (let i = 1; i <= N; i++) {
            const a1 = addPoint(state, i * 10, 0);
            const a2 = addPoint(state, i * 10, (N + 1) * 10);
            addSegmentTwoPoints(state, a1.id, a2.id);
            const b1 = addPoint(state, 0, i * 10);
            const b2 = addPoint(state, (N + 1) * 10, i * 10);
            addSegmentTwoPoints(state, b1.id, b2.id);
        }
        const first = findAllIntersections(state);
        expect(first).toHaveLength(N * N); // complete without hanging
        const second = findAllIntersections(state);
        expect(second).toHaveLength(0); // fixed-point reached, terminates
        expect(state.points.size).toBe(4 * N + N * N);
    });

    it('intersection points carry unique ids and are registered in the state', () => {
        const a1 = addPoint(state, -5, 0);
        const a2 = addPoint(state, 5, 0);
        const b1 = addPoint(state, 0, -5);
        const b2 = addPoint(state, 0, 5);
        addSegmentTwoPoints(state, a1.id, a2.id);
        addSegmentTwoPoints(state, b1.id, b2.id);
        const [pt] = findAllIntersections(state);
        expect(pt).toBeDefined();
        expect(state.points.get(pt.id)).toBe(pt);
        expect(new Set([...state.points.keys()]).size).toBe(state.points.size);
    });

    it('works on an empty state and after deletes', () => {
        expect(findAllIntersections(state)).toHaveLength(0);
        const a1 = addPoint(state, -5, 0);
        const a2 = addPoint(state, 5, 0);
        const b1 = addPoint(state, 0, -5);
        const b2 = addPoint(state, 0, 5);
        const s1 = addSegmentTwoPoints(state, a1.id, a2.id)!;
        addSegmentTwoPoints(state, b1.id, b2.id);
        expect(findAllIntersections(state)).toHaveLength(1);
        deleteEntity(state, s1.id);
        expect(findAllIntersections(state)).toHaveLength(0);
    });
});
