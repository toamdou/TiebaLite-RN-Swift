import { useCallback, useEffect, useState } from 'react';
import { Form, Section, Button, Text, Image, ConfirmationDialog } from '@expo/ui/swift-ui';
import { useRouter } from 'expo-router';
import { hapticImpact, hapticNotify, ImpactFeedbackStyle, NotificationFeedbackType } from '@/utils/haptics';
import { useAuthStore } from '@/stores/authStore';
import { getAccountListSync, deleteAccountSync } from '@/services/storage/AuthSQLiteStorage';
import type { Account } from '@/types';
import { ThemedHost } from '@/components/ui/ThemedHost';

export default function AccountPage() {
  const router = useRouter();
  const { isLoggedIn, account: currentAccount, switchAccount, logout } = useAuthStore();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [removeTarget, setRemoveTarget] = useState<Account | null>(null);
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
        hapticNotify(NotificationFeedbackType.Success);
      } catch {}
    },
    [currentAccount, switchAccount],
  );

  const handleRemoveConfirm = useCallback(async () => {
    if (!removeTarget) return;
    hapticImpact(ImpactFeedbackStyle.Medium);
    const isCurrent = currentAccount?.uid === removeTarget.uid;
    try {
      if (isCurrent) {
        await logout();
      } else {
        deleteAccountSync(removeTarget.uid);
      }
      setAccounts(getAccountListSync());
      hapticNotify(NotificationFeedbackType.Success);
    } catch {}
    setRemoveTarget(null);
  }, [removeTarget, currentAccount, logout]);

  const handleLogout = useCallback(async () => {
    try {
      await logout();
      hapticNotify(NotificationFeedbackType.Success);
      router.back();
    } catch {}
    setShowLogoutDialog(false);
  }, [logout, router]);

  return (
    <ThemedHost style={{ flex: 1 }}>
      <Form>
        <Section title="已登录账号">
          {accounts.map((item) => {
            const isCurrent = currentAccount?.uid === item.uid;
            return (
              <Button
                key={item.uid}
                onPress={() => handleSwitch(item)}
              >
                {[
                  <Text key="name">{item.nameShow || item.name || ''}</Text>,
                  <Text key="uid">{item.name ? `@${item.name}` : `UID: ${item.uid}`}</Text>,
                  ...(isCurrent
                    ? [<Image key="check" systemName="checkmark.circle.fill" size={16} color="#34C759" />]
                    : []),
                ]}
              </Button>
            );
          })}
          {accounts.length === 0 && (
            <Text>暂无账号，登录后将显示在这里</Text>
          )}
        </Section>

        {isLoggedIn && (
          <Section>
            <Button
              label="编辑个人资料"
              systemImage="person.crop.circle.badge.checkmark"
              onPress={() => {
                hapticImpact(ImpactFeedbackStyle.Light);
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
              hapticImpact(ImpactFeedbackStyle.Light);
              router.push('/login');
            }}
          />
        </Section>

        {accounts.length > 0 && (
          <Section title="管理">
            <ConfirmationDialog
              title="移除账号"
              isPresented={!!removeTarget}
              onIsPresentedChange={(v) => { if (!v) setRemoveTarget(null); }}
              titleVisibility="visible"
            >
              <ConfirmationDialog.Trigger>
                {accounts.map((item) => (
                  <Button
                    key={`remove-${item.uid}`}
                    role="destructive"
                    onPress={() => setRemoveTarget(item)}
                  >
                    <Text>移除 {item.nameShow || item.name}</Text>
                  </Button>
                ))}
              </ConfirmationDialog.Trigger>
              <ConfirmationDialog.Actions>
                <Button label="移除" role="destructive" onPress={handleRemoveConfirm} />
                <Button label="取消" role="cancel" />
              </ConfirmationDialog.Actions>
              <ConfirmationDialog.Message>
                <Text>
                  {removeTarget && currentAccount?.id === removeTarget.id
                    ? '这是当前登录的账号，移除后将退出登录。'
                    : `确定要移除账号「${removeTarget?.nameShow || removeTarget?.name}」吗？`}
                </Text>
              </ConfirmationDialog.Message>
            </ConfirmationDialog>
          </Section>
        )}

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
