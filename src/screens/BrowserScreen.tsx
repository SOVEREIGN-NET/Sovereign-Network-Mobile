import React, { useState } from 'react';
import { ScrollView } from 'react-native';
import { Card, Text, Button, Column, Input } from '../components';
import { useTranslation } from '../i18n';
import { colors, spacing } from '../theme';

const BrowserScreen = () => {
  const { t } = useTranslation();
  const [urlInput, setUrlInput] = useState('zhtp://network.sovereign');
  const [loading, setLoading] = useState(false);

  const mockWebsites = t.browser.websites as Record<string, { title: string; description: string; content: string }>;

  const suggestedSites = [
    { url: 'zhtp://network.sovereign', ...t.browser.suggestedSitesList.networkHub },
    { url: 'dao://governance', ...t.browser.suggestedSitesList.daoPortal },
    { url: 'mesh://nodes.local', ...t.browser.suggestedSitesList.meshNetwork },
    { url: 'zk://identity.sovereign', ...t.browser.suggestedSitesList.zkIdentity },
    { url: 'web4://chat.sovereign', ...t.browser.suggestedSitesList.chat },
  ];

  const [browserContent, setBrowserContent] = useState(mockWebsites['zhtp://network.sovereign']);

  const handleNavigate = () => {
    setLoading(true);
    setTimeout(() => {
      const normalizedUrl = urlInput.toLowerCase().trim();
      setBrowserContent(
        mockWebsites[normalizedUrl] || {
          title: t.browser.errors.notFound,
          description: t.browser.errors.notResolved,
          content: t.browser.errors.couldNotResolve.replace('{domain}', normalizedUrl),
        },
      );
      setLoading(false);
    }, 500);
  };

  return (
    <ScrollView
      testID="browser-screen"
      style={{
        flex: 1,
        backgroundColor: colors.bg_dark,
        padding: spacing.lg,
      }}
    >
      {/* Browser Controls */}
      <Card>
        <Text variant="h3">{t.browser.title}</Text>
        <Column gap="md" style={{ marginTop: spacing.md }}>
          <Input
            placeholder={t.browser.urlPlaceholder}
            value={urlInput}
            onChangeText={setUrlInput}
            onSubmitEditing={handleNavigate}
          />
          <Button onPress={handleNavigate}>{t.browser.navigateButton}</Button>
          <Text variant="caption" style={{ color: colors.success, textAlign: 'center' }}>
            {t.browser.connectionStatus}
          </Text>
        </Column>
      </Card>

      {/* Browser Content */}
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

      {/* Suggested Sites */}
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

      {/* Browser Features */}
      <Card>
        <Text variant="caption">{t.browser.features.title}</Text>
        <Column gap="md" style={{ marginTop: spacing.xs }}>
          <Text variant="small">{t.browser.features.encryption}</Text>
          <Text variant="small">{t.browser.features.meshRouting}</Text>
          <Text variant="small">{t.browser.features.zeroCensorship}</Text>
          <Text variant="small">{t.browser.features.zeroKnowledge}</Text>
        </Column>
      </Card>
    </ScrollView>
  );
};

export default BrowserScreen;
