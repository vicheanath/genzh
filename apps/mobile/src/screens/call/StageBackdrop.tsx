import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { Colors } from '../../theme/tokens';

/**
 * The aurora behind the call.
 *
 * Two off-centre pools of colour — lime on the warm side, cyan on the cold —
 * which is `--stage-aurora` in tokens.css. It is the one thing that stops a
 * dark grid of tiles reading as a flat sheet, and it costs a single SVG rather
 * than a blur filter or a stack of shadowed views.
 *
 * The two hues are the app's two accents, and the reason there are two: the
 * stage has to tell "you are transmitting" apart from "this is the brand", and
 * a single-accent wash cannot.
 */
export function StageBackdrop() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="auroraAccent" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={Colors.accent} stopOpacity={0.13} />
            <Stop offset="1" stopColor={Colors.accent} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="auroraLive" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={Colors.live} stopOpacity={0.14} />
            <Stop offset="1" stopColor={Colors.live} stopOpacity={0} />
          </RadialGradient>
        </Defs>

        {/* Percentage geometry so the pools keep their placement on any screen
            — the web sizes them in rem against a viewport that varies just as
            much. */}
        <Ellipse cx="12%" cy="-6%" rx="85%" ry="42%" fill="url(#auroraAccent)" />
        <Ellipse cx="96%" cy="104%" rx="70%" ry="38%" fill="url(#auroraLive)" />
      </Svg>
    </View>
  );
}
