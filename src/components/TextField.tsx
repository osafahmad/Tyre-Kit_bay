import React from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { colors, fonts, monospaceFont, radius, sizes } from '../theme';
import { AppText } from './AppText';

type Props = Omit<TextInputProps, 'style'> & {
  label: string;
  optional?: boolean;
  helper?: string;
  monospace?: boolean;
};

/** Labelled input from Vehicle.dc.html. */
export function TextField({ label, optional, helper, monospace, ...input }: Props) {
  return (
    <View>
      <AppText variant="rowLabel" weight="semibold" style={styles.label}>
        {label}
        {optional ? (
          <AppText variant="rowLabel" color="textSecondary">
            {' (optional)'}
          </AppText>
        ) : null}
      </AppText>
      <TextInput
        accessibilityLabel={optional ? `${label}, optional` : label}
        // Lighter than real text so an example is never mistaken for a scanned value.
        placeholderTextColor={colors.inputBorder}
        autoCorrect={false}
        {...input}
        style={[styles.input, monospace ? styles.mono : styles.sans]}
      />
      {helper ? (
        <AppText variant="caption" color="textSecondary" style={styles.helper}>
          {helper}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: 8 },
  input: {
    minHeight: sizes.input,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radius.control,
    color: colors.black,
    backgroundColor: colors.white,
  },
  sans: { fontFamily: fonts.semibold, fontSize: 18 },
  mono: { fontFamily: monospaceFont, fontSize: 16, fontWeight: '600' },
  helper: { marginTop: 8 },
});
