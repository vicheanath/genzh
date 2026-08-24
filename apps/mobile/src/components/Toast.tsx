import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, X } from 'lucide-react-native';

import { Colors, Radius, Spacing } from '../theme/tokens';

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  type: 'success' | 'error';
}

interface ToastApi {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/**
 * Transient confirmations.
 *
 * The app has a lot of small side effects — an invite copied, a message
 * deleted, a friend request sent — that are invisible if nothing says they
 * happened. A callout in the layout would push content around for two seconds;
 * a toast lives over it, so nothing reflows.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const add = useCallback(
    (type: ToastItem['type'], title: string, description?: string) => {
      const id = nextId.current++;
      setItems((current) => [...current, { id, title, description, type }]);
      setTimeout(() => dismiss(id), type === 'error' ? 6000 : 3500);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (title, description) => add('success', title, description),
      error: (title, description) => add('error', title, description),
    }),
    [add],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  items,
  onDismiss,
}: {
  items: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  const insets = useSafeAreaInsets();

  if (items.length === 0) return null;

  return (
    // `pointerEvents="box-none"` so the strip never eats taps meant for the
    // screen underneath — only the toasts themselves are touchable.
    <View
      pointerEvents="box-none"
      style={[styles.viewport, { top: insets.top + Spacing.sm }]}
    >
      {items.map((item) => (
        <ToastRow key={item.id} item={item} onDismiss={() => onDismiss(item.id)} />
      ))}
    </View>
  );
}

function ToastRow({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(enter, {
      toValue: 1,
      useNativeDriver: true,
      damping: 18,
      stiffness: 220,
    }).start();
  }, [enter]);

  const isError = item.type === 'error';

  return (
    <Animated.View
      style={[
        styles.toast,
        isError && styles.toastError,
        {
          opacity: enter,
          transform: [
            { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) },
          ],
        },
      ]}
    >
      <View style={[styles.icon, isError && styles.iconError]}>
        {isError ? (
          <X size={13} color={Colors.danger} strokeWidth={3} />
        ) : (
          <Check size={13} color={Colors.accent} strokeWidth={3} />
        )}
      </View>

      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        {item.description ? (
          <Text style={styles.description} numberOfLines={3}>
            {item.description}
          </Text>
        ) : null}
      </View>

      <Pressable onPress={onDismiss} hitSlop={10} accessibilityLabel="Dismiss">
        <X size={15} color={Colors.textSubtle} />
      </Pressable>
    </Animated.View>
  );
}

/**
 * The app's toast vocabulary.
 *
 * Two verbs rather than a free-form `add`, because every toast in this app is
 * either "that worked" or "that did not".
 */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used within a ToastProvider');
  return api;
}

const styles = StyleSheet.create({
  viewport: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    gap: Spacing.sm,
    zIndex: 1000,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  toastError: {
    borderColor: Colors.danger,
  },
  icon: {
    width: 24,
    height: 24,
    borderRadius: Radius.full,
    backgroundColor: Colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconError: {
    backgroundColor: Colors.dangerSubtle,
  },
  text: {
    flex: 1,
  },
  title: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  description: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
});
