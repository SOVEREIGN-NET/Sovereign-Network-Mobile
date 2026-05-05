import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Svg, { Polyline, Line, Text as SvgText, Polygon } from 'react-native-svg';
import {
  createSovSwapStyles,
  sovswapColors,
  sovswapSpacing,
  sovswapType,
} from '../../../../screens/sovswap/theme/sovswapTokens';

export interface SovPriceChartProps {
  /** Numeric series, one value per period. */
  data: number[];
  /** X-axis labels — only first/middle/last are drawn to avoid clutter. */
  labels: string[];
  /** Chart line colour. Defaults to ink. */
  accent?: string;
  height?: number;
  /** Show under-line filled area (true by default). */
  filled?: boolean;
}

/**
 * Almanac price chart. No grid box, no axis bullets — just a single
 * thin line traced over a hairline baseline, three sparse x-tick
 * labels, and a soft fill under the curve so the eye reads the trend
 * without visual noise.
 *
 * Drawn in `react-native-svg` because the rest of the app already
 * pulls it in (see TopologyMap).
 */
export const SovPriceChart: React.FC<SovPriceChartProps> = ({
  data,
  labels,
  accent = sovswapColors.paperInk,
  height = 200,
  filled = true,
}) => {
  // Track the actual rendered width so the viewBox matches it pixel-for-pixel.
  // Without this, the Svg uses a fixed viewBox and `preserveAspectRatio`
  // letterboxes the curve on wide screens, leaving visible whitespace
  // either side of the chart that the user can see when other rows
  // (cards below) extend further.
  const [layoutW, setLayoutW] = useState<number>(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.width);
    if (next > 0 && next !== layoutW) setLayoutW(next);
  };
  const chart = useMemo(() => {
    if (!data.length) return null;
    const padX = 16;
    const padTop = 24;
    const padBot = 28;
    // Fall back to 320 until layout has measured the host (first frame).
    const w = layoutW > 0 ? layoutW : 320;
    const h = height;
    const innerW = w - padX * 2;
    const innerH = h - padTop - padBot;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const xStep = data.length > 1 ? innerW / (data.length - 1) : 0;
    const points = data.map((v, i) => {
      const x = padX + i * xStep;
      const y = padTop + innerH * (1 - (v - min) / range);
      return { x, y };
    });
    const polyPts = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const fillPts = `${padX},${padTop + innerH} ${polyPts} ${(padX + innerW).toFixed(1)},${padTop + innerH}`;
    return {
      polyPts,
      fillPts,
      w,
      h,
      padX,
      padTop,
      padBot,
      innerH,
      innerW,
      min,
      max,
    };
  }, [data, height, layoutW]);

  if (!chart) return null;
  const { polyPts, fillPts, w, h, padX, padTop, innerH, innerW, min, max } =
    chart;

  // Sparse x-tick labels: first, middle, last.
  const ticks = labels.length
    ? [
        { idx: 0, label: labels[0] },
        {
          idx: Math.floor((labels.length - 1) / 2),
          label: labels[Math.floor((labels.length - 1) / 2)],
        },
        { idx: labels.length - 1, label: labels[labels.length - 1] },
      ]
    : [];
  const xStep = data.length > 1 ? innerW / (data.length - 1) : 0;

  return (
    <View style={[styles.wrap, { height: h + 8 }]} onLayout={onLayout}>
      <Svg
        width="100%"
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
      >
        {/* Top + bottom hairline rules */}
        <Line
          x1={padX}
          y1={padTop}
          x2={padX + innerW}
          y2={padTop}
          stroke={sovswapColors.ruleFaint}
          strokeWidth={1}
        />
        <Line
          x1={padX}
          y1={padTop + innerH}
          x2={padX + innerW}
          y2={padTop + innerH}
          stroke={sovswapColors.rule}
          strokeWidth={1}
        />
        {/* Min/max labels along the right edge */}
        <SvgText
          x={padX + innerW - 2}
          y={padTop + 8}
          fontSize="9"
          
          fill={sovswapColors.paperInkFaint}
          textAnchor="end"
        >
          {`$${max.toFixed(2)}`}
        </SvgText>
        <SvgText
          x={padX + innerW - 2}
          y={padTop + innerH - 4}
          fontSize="9"
          
          fill={sovswapColors.paperInkFaint}
          textAnchor="end"
        >
          {`$${min.toFixed(2)}`}
        </SvgText>
        {/* Filled area under curve */}
        {filled ? (
          <Polygon points={fillPts} fill={accent} fillOpacity={0.08} />
        ) : null}
        {/* Curve */}
        <Polyline
          points={polyPts}
          fill="none"
          stroke={accent}
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* X-tick labels */}
        {ticks.map(t => (
          <SvgText
            key={`${t.idx}-${t.label}`}
            x={padX + t.idx * xStep}
            y={h - 8}
            fontSize="9"
            
            fill={sovswapColors.paperInkFaint}
            textAnchor={t.idx === 0 ? 'start' : t.idx === data.length - 1 ? 'end' : 'middle'}
          >
            {t.label}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
};

/** Sparkline-only variant used inline without axis labels. */
export const SovSparkline: React.FC<{ data: number[]; accent?: string; height?: number }> = ({
  data,
  accent = sovswapColors.paperInk,
  height = 36,
}) => {
  const chart = useMemo(() => {
    if (!data.length) return null;
    const w = 120;
    const h = height;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const xStep = data.length > 1 ? w / (data.length - 1) : 0;
    const polyPts = data
      .map((v, i) => `${(i * xStep).toFixed(1)},${(h - (h - 4) * ((v - min) / range) - 2).toFixed(1)}`)
      .join(' ');
    return { polyPts, w, h };
  }, [data, height]);
  if (!chart) return null;
  return (
    <Svg width="100%" height={chart.h} viewBox={`0 0 ${chart.w} ${chart.h}`}>
      <Polyline
        points={chart.polyPts}
        fill="none"
        stroke={accent}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
};

const styles = createSovSwapStyles(() => StyleSheet.create({
  wrap: {
    width: '100%',
    paddingTop: 4,
  },
}));

export default SovPriceChart;
