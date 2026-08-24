import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TextInputProps, ViewStyle } from 'react-native';
import { Radius, Spacing, type Palette } from '../theme/tokens';
import { useThemedStyles, useColors } from '../theme/ThemeContext';

export interface InputProps extends TextInputProps {
  label?: string;
  error?: string | null;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  containerStyle?: ViewStyle;
}

export function Input({
  label,
  error,
  leftIcon,
  rightIcon,
  containerStyle,
  multiline,
  style,
  ...props
}: InputProps) {
  const styles = useThemedStyles(makeStyles);
  const c = useColors();
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.inputWrapper,
          multiline ? styles.wrapperMultiline : styles.wrapperSingle,
          isFocused && styles.wrapperFocused,
          error ? styles.wrapperError : null,
        ]}
      >
        {leftIcon ? <View style={styles.leftIcon}>{leftIcon}</View> : null}
        <TextInput
          style={[
            styles.input,
            leftIcon ? styles.inputWithLeftIcon : null,
            rightIcon ? styles.inputWithRightIcon : null,
            style,
          ]}
          placeholderTextColor={c.textDim}
          selectionColor={c.accent}
          multiline={multiline}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          {...props}
        />
        {rightIcon ? <View style={styles.rightIcon}>{rightIcon}</View> : null}
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
  container: {
    marginBottom: 14,
    width: '100%',
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    color: c.textSubtle,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.sunken,
    borderWidth: 1,
    borderColor: c.border,
    overflow: 'hidden',
  },
  wrapperSingle: {
    height: 48,
    borderRadius: Radius.pill,
    paddingHorizontal: 14,
  },
  wrapperMultiline: {
    minHeight: 88,
    borderRadius: Radius.lg,
    padding: 12,
    alignItems: 'flex-start',
  },
  wrapperFocused: {
    borderColor: c.accent,
    backgroundColor: c.surface,
  },
  wrapperError: {
    borderColor: c.danger,
  },
  input: {
    flex: 1,
    color: c.text,
    fontSize: 15,
    paddingVertical: 0,
  },
  inputWithLeftIcon: {
    paddingLeft: 8,
  },
  inputWithRightIcon: {
    paddingRight: 8,
  },
  leftIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 12,
    color: c.danger,
    marginTop: 4,
    marginLeft: 4,
    fontWeight: '600',
  },
});
