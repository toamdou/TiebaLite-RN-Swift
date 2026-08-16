import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import {
  Form, Section, Button, Text, Image, HStack, Menu, RNHostView, ConfirmationDialog,
  Button as SWButton,
} from '@expo/ui/swift-ui';
import { labelStyle, buttonStyle, frame } from '@expo/ui/swift-ui/modifiers';
import { useRouter } from 'expo-router';
import { hapticForScene } from '@/theme/hapticsMap';
import { useAuthStore } from '@/stores/authStore';
import { getAccountListSync, deleteAccountSync } from '@/services/storage/AuthSQLiteStorage';
import type { Account } from '@/types';
import { ThemedHost } from '@/components/ui/ThemedHost';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spacing } from '@/theme';
import { useThemeColors } from '@/theme/ThemeContext';

export default function AccountPage() {
  const router = useRouter();
  const { colors } = useThemeColors();
  const { isLoggedIn, account: currentAccount, switchAccount, logout } = useAuthStore();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  const loadAccounts = useCallback(async () => {
    try {
      setAccounts(getAccountListSync());
    } catch {}
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh account list after auth changes; the initial list is already seeded in state.
    loadAccounts();
  }, [isLoggedIn, currentAccount, loadAccounts]);

  const handleSwitch = useCallback(
    async (account: Account) => {
      if (currentAccount?.uid === account.uid) return;
      try {
        await switchAccount(account);
        hapticForScene('action-success');
      } catch {}
    },
    [currentAccount, switchAccount],
  );

  // 每行右侧菜单触发移除；统一用 uid 作主键判断当前账号（与 switch/delete 一致）
  const handleRemoveAccount = useCallback(
    (account: Account) => {
      const isCurrent = currentAccount?.uid === account.uid;
      Alert.alert(
        '移除账号',
        isCurrent
          ? '这是当前登录的账号，移除后将退出登录。'
          : `确定要移除账号「${account.nameShow || account.name || ''}」吗？`,
        [
          { text: '取消', style: 'cancel' },
          {
            text: '移除',
            style: 'destructive',
            onPress: async () => {
              hapticForScene('press');
              try {
                if (isCurrent) {
                  await logout();
                } else {
                  deleteAccountSync(account.uid);
                }
                setAccounts(getAccountListSync());
                hapticForScene('action-success');
              } catch {}
            },
          },
        ],
      );
    },
    [currentAccount, logout],
  );

  const handleLogout = useCallback(async () => {
    try {
      await logout();
      hapticForScene('action-success');
      router.back();
    } catch {}
    setShowLogoutDialog(false);
  }, [logout, router]);

  return (
    <ThemedHost style={{ flex: 1 }}>
      <Form>
        <Section title="已登录账号">
          {accounts.length === 0 ? (
            <RNHostView matchContents>
              <EmptyState
                title="暂无账号"
                description="登录后将显示在这里"
                icon="person.crop.circle.badge.questionmark"
                style={styles.emptyAccounts}
              />
            </RNHostView>
          ) : (
            accounts.map((item) => {
              const isCurrent = currentAccount?.uid === item.uid;
              return (
                <HStack key={item.uid} alignment="center" spacing={Spacing.sm}>
                  {/* 点击整行切换账号（主键统一用 uid） */}
                  <Button
                    onPress={() => handleSwitch(item)}
                    modifiers={[frame({ maxWidth: 9999, alignment: 'leading' })]}
                  >
                    {/* 单一 Fragment 子节点：@expo/ui Button 的 children 类型
                        不接受 null，条件渲染需收敛进 Fragment */}
                    <>
                      <Text>{item.nameShow || item.name || ''}</Text>
                      <Text>{item.name ? `@${item.name}` : `UID: ${item.uid}`}</Text>
                      {isCurrent ? (
                        <Image systemName="checkmark.circle.fill" size={16} color={colors.success} />
                      ) : undefined}
                    </>
                  </Button>
                  {/* 每行右侧菜单：移除账号，替代「管理」Section 重复的移除行 */}
                  <Menu
                    label=""
                    systemImage="ellipsis"
                    modifiers={[labelStyle('iconOnly'), buttonStyle('plain')]}
                  >
                    <SWButton
                      label="移除账号"
                      systemImage="trash"
                      role="destructive"
                      onPress={() => handleRemoveAccount(item)}
                    />
                  </Menu>
                </HStack>
              );
            })
          )}
        </Section>

        {isLoggedIn && (
          <Section>
            <Button
              label="编辑个人资料"
              systemImage="person.crop.circle.badge.checkmark"
              onPress={() => {
                hapticForScene('press');
                router.push('/settings/edit-profile' as any);
              }}
            />
          </Section>
        )}

        <Section>
          <Button
            label="添加账号"
            systemImage="person.badge.plus"
            onPress={() => {
              hapticForScene('press');
              router.push('/login');
            }}
          />
        </Section>

        {isLoggedIn && (
          <Section>
            <ConfirmationDialog
              title="退出登录"
              isPresented={showLogoutDialog}
              onIsPresentedChange={(v) => { if (!v) setShowLogoutDialog(false); }}
              titleVisibility="visible"
            >
              <ConfirmationDialog.Trigger>
                <Button
                  label="退出登录"
                  systemImage="rectangle.portrait.and.arrow.right"
                  role="destructive"
                  onPress={() => setShowLogoutDialog(true)}
                />
              </ConfirmationDialog.Trigger>
              <ConfirmationDialog.Actions>
                <Button label="退出" role="destructive" onPress={handleLogout} />
                <Button label="取消" role="cancel" />
              </ConfirmationDialog.Actions>
              <ConfirmationDialog.Message>
                <Text>确定要退出当前账号吗？</Text>
              </ConfirmationDialog.Message>
            </ConfirmationDialog>
          </Section>
        )}
      </Form>
    </ThemedHost>
  );
}

const styles = StyleSheet.create({
  emptyAccounts: {
    paddingVertical: Spacing.xl,
  },
});
