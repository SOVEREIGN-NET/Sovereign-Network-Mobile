import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, Text, Button, Column, Row, ScreenLayout, FormField, Web4View, isWeb4ViewAvailable } from '../components';
import { Input } from '../components/atoms';
import { useTranslation } from '../i18n';
import { colors, spacing } from '../theme';
import { DEFAULT_NODE_HOST, DEFAULT_NODE_PORT } from '../config';
import SShieldLogo from '../components/atoms/Logo';

const BrowserScreen = ({ route, navigation }: any) => {
  const { t } = useTranslation();
  const [urlInput, setUrlInput] = useState(route?.params?.url || 'zhtp://centralhub.sov');
  const [loading, setLoading] = useState(false);
  const [webLoading, setWebLoading] = useState(true);

  const mockWebsites = t.browser.websites as Record<string, { title: string; description: string; content: string }>;

  const suggestedSites = [
    { url: 'zhtp://network.sovereign', ...t.browser.suggestedSitesList.networkHub },
    { url: 'dao://governance', ...t.browser.suggestedSitesList.daoPortal },
    { url: 'mesh://nodes.local', ...t.browser.suggestedSitesList.meshNetwork },
    { url: 'zk://identity.sovereign', ...t.browser.suggestedSitesList.zkIdentity },
    { url: 'zhtp://chat.sovereign', ...t.browser.suggestedSitesList.chat },
  ];

  const [browserContent, setBrowserContent] = useState(mockWebsites['zhtp://centralhub.sov']);
  const isZhtp = useMemo(() => {
    const normalized = (urlInput ?? '').toString().trim().toLowerCase();
    return normalized.startsWith('zhtp://');
  }, [urlInput]);
  const web4Domain = useMemo(() => {
    if (!isZhtp) return '';
    try {
      const normalized = (urlInput ?? '').toString().replace(/^zhtp:\/\//i, 'https://');
      const parsed = new URL(normalized);
      return parsed.hostname;
    } catch {
      return '';
    }
  }, [isZhtp, urlInput]);

  const handleNavigate = useCallback(
    (targetUrl?: string) => {
      const nextUrl = (targetUrl ?? urlInput ?? '').toString();
      const normalized = nextUrl.trim().toLowerCase();
      const isNextZhtp = normalized.startsWith('zhtp://');
      if (isNextZhtp) {
        setUrlInput(nextUrl);
        setLoading(false);
        return;
      }
      setLoading(true);
      const normalizedUrl = nextUrl.toLowerCase().trim();
      setUrlInput(nextUrl);
      setTimeout(() => {
        setBrowserContent(
          mockWebsites[normalizedUrl] || {
            title: t.browser.errors.notFound,
            description: t.browser.errors.notResolved,
            content: t.browser.errors.couldNotResolve.replace('{domain}', normalizedUrl),
          },
        );
        setLoading(false);
      }, 500);
    },
    [mockWebsites, t.browser.errors.couldNotResolve, t.browser.errors.notFound, t.browser.errors.notResolved, urlInput],
  );

  useEffect(() => {
    if (route?.params?.url) {
      handleNavigate(route.params.url);
    }
  }, [handleNavigate, route?.params?.url]);

  const renderZhtp = () => (
      <View style={{ flex: 1, backgroundColor: colors.bg_darkest }}>
        <View style={{ paddingHorizontal: spacing.xs, paddingTop: spacing.sm, paddingBottom: spacing.xs, backgroundColor: colors.bg_darkest }}>
        <Row justify="space-between" align="center" style={{ marginBottom: spacing.xs }}>
          <Button size="sm" variant="secondary" onPress={() => navigation.goBack()}>
            Close
          </Button>
          <Text variant="caption" style={{ color: colors.text_secondary }}>
            {t.browser.connectionStatus}
          </Text>
        </Row>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            borderRadius: 12,
            backgroundColor: colors.bg_card,
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: spacing.xs,
            height: 44,
          }}
        >
          <Button
            onPress={() => handleNavigate(urlInput)}
            size="sm"
            variant="secondary"
            style={{ paddingHorizontal: spacing.xs, paddingVertical: 6, height: '100%', width: 40, justifyContent: 'center' }}
          >
            ↻
          </Button>
          <View style={{ flex: 1, marginHorizontal: spacing.sm, justifyContent: 'center', height: '100%' }}>
            <Input
              placeholder={t.browser.urlPlaceholder}
              value={urlInput}
              onChangeText={setUrlInput}
              onSubmitEditing={() => handleNavigate()}
              containerStyle={{ marginBottom: 0, height: '100%' }}
              style={{ height: '100%', paddingVertical: 10 }}
              textInputStyle={{ paddingVertical: 2 }}
            />
          </View>
          <Button
            onPress={() => handleNavigate()}
            size="sm"
            variant="secondary"
            style={{ paddingHorizontal: spacing.xs, paddingVertical: 6, height: '100%', width: 40, justifyContent: 'center' }}
          >
            →
          </Button>
        </View>
      </View>
      <View style={{ flex: 1, backgroundColor: colors.bg_darkest, paddingBottom: 0 }}>
        {isWeb4ViewAvailable && web4Domain ? (
          <View style={{ flex: 1, backgroundColor: colors.bg_darkest }}>
            <Web4View
              style={{ flex: 1, backgroundColor: colors.bg_darkest }}
              domain={web4Domain}
              nodeHost={DEFAULT_NODE_HOST}
              nodePort={DEFAULT_NODE_PORT}
              cacheLimitMb={150}
              allowHttpsExternal={false}
              onLoadStart={() => setWebLoading(true)}
              onLoadEnd={() => setWebLoading(false)}
              onError={() => setWebLoading(false)}
            />
            {webLoading && (
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0,0,0,0.4)',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
                pointerEvents="none"
              >
                <SShieldLogo size={64} />
                <View style={{ marginTop: spacing.sm }}>
                  <ActivityIndicator size="small" color={colors.text_secondary} />
                </View>
              </View>
            )}
          </View>
        ) : (
          <View style={{ flex: 1, padding: spacing.md, justifyContent: 'center' }}>
            <Text variant="body" style={{ color: colors.text_secondary, textAlign: 'center' }}>
              Web runtime not available on this build. Please rebuild native binaries.
            </Text>
          </View>
        )}
      </View>
    </View>
  );

  const renderMock = () => (
    <>
      <Card>
        <Text variant="h3">{t.browser.title}</Text>
        <Column gap="md" style={{ marginTop: spacing.md }}>
          <FormField
            label=""
            placeholder={t.browser.urlPlaceholder}
            value={urlInput}
            onChangeText={setUrlInput}
            onSubmitEditing={() => handleNavigate()}
            containerStyle={{ marginBottom: 0 }}
          />
          <Button onPress={() => handleNavigate()}>{t.browser.navigateButton}</Button>
          <Text variant="caption" style={{ color: colors.success, textAlign: 'center' }}>
            {t.browser.connectionStatus}
          </Text>
        </Column>
      </Card>

      {!loading && browserContent && (
        <Card>
          <Text variant="h2" style={{ color: colors.primary, marginBottom: spacing.sm }}>
            {browserContent.title}
          </Text>
          <Text variant="caption" style={{ color: colors.text_secondary, marginBottom: spacing.md }}>
            {browserContent.description}
          </Text>
          <Text variant="body">{browserContent.content}</Text>
        </Card>
      )}

      <Card>
        <Text variant="h3">{t.browser.suggestedSites}</Text>
        <Column gap="sm" style={{ marginTop: spacing.md }}>
          {suggestedSites.map(site => (
            <Button
              key={site.url}
              onPress={() => {
                setUrlInput(site.url);
                setTimeout(() => handleNavigate(), 100);
              }}
              variant="outline"
            >
              <Text>{site.title}</Text>
            </Button>
          ))}
        </Column>
      </Card>

      <Card>
        <Text variant="caption">{t.browser.features.title}</Text>
        <Column gap="md" style={{ marginTop: spacing.xs }}>
          <Text variant="small">{t.browser.features.encryption}</Text>
          <Text variant="small">{t.browser.features.meshRouting}</Text>
          <Text variant="small">{t.browser.features.zeroCensorship}</Text>
          <Text variant="small">{t.browser.features.zeroKnowledge}</Text>
        </Column>
      </Card>
    </>
  );

  if (isZhtp) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg_darkest }} edges={['top']}>
        <View style={{ flex: 1 }}>
          {renderZhtp()}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <ScreenLayout
      testID="browser-screen"
      contentContainerStyle={{ flexGrow: 1, paddingBottom: 0 }}
    >
      {renderMock()}
    </ScreenLayout>
  );
};

export default BrowserScreen;
