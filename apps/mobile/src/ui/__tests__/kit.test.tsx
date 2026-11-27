import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import i18n from '../../i18n';
import { Button } from '../Button';
import { Card } from '../Card';
import { EmptyState } from '../EmptyState';
import { ListRow } from '../ListRow';
import { ScreenHeader } from '../ScreenHeader';
import { StatusBadge } from '../StatusBadge';
import { Text } from '../Text';
import { TextField } from '../TextField';

const METRICS = { frame: { x: 0, y: 0, width: 360, height: 640 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };
const Insets = ({ children }: { children: ReactNode }) => (
  <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>
);

const minHeightOf = (style: unknown): number => (StyleSheet.flatten(style as ViewStyle) as ViewStyle).minHeight as number;

describe('Button', () => {
  it('presses, and is at least 48 dp tall', async () => {
    const onPress = jest.fn();
    await render(<Button label="Save" onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(minHeightOf(button.props.style)).toBeGreaterThanOrEqual(48);
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('ignores taps while busy or disabled', async () => {
    const onPress = jest.fn();
    await render(
      <>
        <Button label="Busy" busy onPress={onPress} />
        <Button label="Off" disabled onPress={onPress} />
      </>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Busy' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Off' }));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('ListRow', () => {
  it('is a button with a chevron when it opens something', async () => {
    const onPress = jest.fn();
    await render(<ListRow title="Tower A" hint="Pune" onPress={onPress} />);
    const row = screen.getByRole('button', { name: 'Tower A, Pune' });
    expect(minHeightOf(row.props.style)).toBeGreaterThanOrEqual(56);
    await fireEvent.press(row);
    expect(onPress).toHaveBeenCalled();
  });

  it('is plain text with no onPress', async () => {
    await render(<ListRow title="Tower A" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Tower A')).toBeTruthy();
  });
});

describe('TextField', () => {
  it('has a label, passes typing through, and shows the error', async () => {
    const onChangeText = jest.fn();
    await render(<TextField label="Phone" value="" onChangeText={onChangeText} error="Too short" />);
    await fireEvent.changeText(screen.getByLabelText('Phone'), '98');
    expect(onChangeText).toHaveBeenCalledWith('98');
    expect(screen.getByText('Too short')).toBeTruthy();
    expect(minHeightOf(screen.getByLabelText('Phone').props.style)).toBeGreaterThanOrEqual(48);
  });
});

describe('StatusBadge, EmptyState, Card, ScreenHeader', () => {
  it('StatusBadge shows its word', async () => {
    await render(<StatusBadge tone="ok" label="Present" />);
    expect(screen.getByLabelText('Present')).toBeTruthy();
  });

  it('EmptyState shows the sentence and runs its one action', async () => {
    const onPress = jest.fn();
    await render(<EmptyState title="No sites yet" action={{ label: 'Refresh', onPress }} />);
    expect(screen.getByText('No sites yet')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Refresh' }));
    expect(onPress).toHaveBeenCalled();
  });

  it('Card renders its children', async () => {
    await render(
      <Card>
        <Text>Inside</Text>
      </Card>,
    );
    expect(screen.getByText('Inside')).toBeTruthy();
  });

  it('ScreenHeader shows the title as a header, and Back only when given', async () => {
    const onBack = jest.fn();
    await render(<ScreenHeader title="Reports" onBack={onBack} />, { wrapper: Insets });
    expect(screen.getByRole('header', { name: 'Reports' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('ScreenHeader has no Back on a top-level screen', async () => {
    await render(<ScreenHeader title="Today" />, { wrapper: Insets });
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });
});

describe('Text', () => {
  afterEach(() => i18n.changeLanguage('en'));

  it('keeps font scaling on, capped', async () => {
    await render(<Text>Hello</Text>);
    expect(screen.getByText('Hello').props.maxFontSizeMultiplier).toBe(1.4);
  });

  it('uses the bundled Devanagari font in Hindi', async () => {
    await i18n.changeLanguage('hi');
    await render(<Text bold>नमस्ते</Text>);
    expect(StyleSheet.flatten(screen.getByText('नमस्ते').props.style).fontFamily).toBe('NotoSansDevanagari_700Bold');
  });
});
