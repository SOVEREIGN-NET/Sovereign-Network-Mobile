import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import MockDataService, { Identity } from '../services/MockDataService';

const IdentityScreen = () => {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        await new Promise(resolve => setTimeout(resolve, 500));
        setIdentity(MockDataService.getIdentity());
        setLoading(false);
      } catch (error) {
        console.error('Error loading identity:', error);
        setLoading(false);
      }
    };
    loadData();
  }, []);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#00d4ff" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>👤 ZK-DID Identity</Text>
        <View style={styles.identityBox}>
          <Text style={styles.avatarText}>{identity?.avatar}</Text>
          <Text style={styles.displayName}>{identity?.displayName}</Text>
          <Text style={styles.did}>{identity?.did}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Details</Text>
        <View style={styles.detailRow}>
          <Text style={styles.label}>Identity Type:</Text>
          <Text style={styles.value}>{identity?.identityType}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.label}>Citizenship:</Text>
          <Text style={[styles.value, { color: identity?.citizenship ? '#00ff00' : '#ff4444' }]}>
            {identity?.citizenship ? '✓ Verified' : '✗ Not Verified'}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.label}>Created:</Text>
          <Text style={styles.value}>{new Date(identity?.createdAt || '').toLocaleDateString()}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <TouchableOpacity style={styles.button}>
          <Text style={styles.buttonText}>Create Identity</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button}>
          <Text style={styles.buttonText}>Backup Identity</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button}>
          <Text style={styles.buttonText}>Verify Biometric</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1e', padding: 16 },
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#00d4ff', marginBottom: 12 },
  identityBox: {
    alignItems: 'center',
    paddingVertical: 20,
    backgroundColor: '#0f0f1e',
    borderRadius: 8,
  },
  avatarText: { fontSize: 48, marginBottom: 8 },
  displayName: { fontSize: 20, fontWeight: 'bold', color: '#ffffff', marginBottom: 4 },
  did: { fontSize: 12, color: '#888888', marginBottom: 4 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3e',
  },
  label: { color: '#cccccc', fontSize: 14 },
  value: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  button: {
    backgroundColor: '#16213e',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  buttonText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
});

export default IdentityScreen;
