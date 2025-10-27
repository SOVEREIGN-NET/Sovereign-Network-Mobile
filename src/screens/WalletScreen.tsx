import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import MockDataService, { Wallet, Transaction } from '../services/MockDataService';

const WalletScreen = () => {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWalletId, setSelectedWalletId] = useState<string>('wallet-1');

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        await new Promise(resolve => setTimeout(resolve, 500));
        setWallets(MockDataService.getWallets());
        setTransactions(MockDataService.getTransactions());
        setLoading(false);
      } catch (error) {
        console.error('Error loading wallet data:', error);
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

  const selectedWallet = wallets.find(w => w.id === selectedWalletId);

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'send':
        return '📤';
      case 'receive':
        return '📥';
      case 'stake':
        return '🔗';
      case 'ubi':
        return '💰';
      default:
        return '💸';
    }
  };

  const getTransactionColor = (type: string) => {
    switch (type) {
      case 'send':
        return '#ff6b6b';
      case 'receive':
        return '#51cf66';
      case 'stake':
        return '#ffd43b';
      case 'ubi':
        return '#00d4ff';
      default:
        return '#cccccc';
    }
  };

  return (
    <ScrollView style={styles.container}>
      {/* Wallet Selection */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>💼 Quantum Wallet</Text>
        <FlatList
          data={wallets}
          scrollEnabled={false}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.walletButton,
                selectedWalletId === item.id && styles.walletButtonActive,
              ]}
              onPress={() => setSelectedWalletId(item.id)}
            >
              <View style={styles.walletButtonContent}>
                <Text style={styles.walletName}>{item.name}</Text>
                <Text style={styles.walletAddress}>{item.address.slice(0, 20)}...</Text>
              </View>
              <Text style={styles.walletBalance}>{item.balance.toLocaleString()}</Text>
              <Text style={styles.walletCurrency}>{item.currency}</Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Balance Display */}
      {selectedWallet && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>💵 Balance</Text>
          <View style={styles.balanceBox}>
            <Text style={styles.balanceAmount}>
              {selectedWallet.balance.toLocaleString()}
            </Text>
            <Text style={styles.balanceCurrency}>{selectedWallet.currency}</Text>
          </View>
          <Text style={styles.fullAddress}>{selectedWallet.address}</Text>
        </View>
      )}

      {/* Quick Actions */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>⚡ Actions</Text>
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionButtonIcon}>📤</Text>
          <Text style={styles.actionButtonText}>Send ZHTP</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionButtonIcon}>📥</Text>
          <Text style={styles.actionButtonText}>Receive ZHTP</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionButtonIcon}>💰</Text>
          <Text style={styles.actionButtonText}>Claim UBI</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionButtonIcon}>🔗</Text>
          <Text style={styles.actionButtonText}>Stake ZHTP</Text>
        </TouchableOpacity>
      </View>

      {/* Recent Transactions */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📜 Recent Transactions</Text>
        {transactions.length === 0 ? (
          <Text style={styles.emptyText}>No transactions yet</Text>
        ) : (
          <FlatList
            data={transactions}
            scrollEnabled={false}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <View style={styles.transactionItem}>
                <View style={styles.transactionLeft}>
                  <Text style={styles.transactionIcon}>{getTransactionIcon(item.type)}</Text>
                  <View style={styles.transactionInfo}>
                    <Text style={styles.transactionType}>
                      {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
                    </Text>
                    <Text style={styles.transactionTime}>
                      {new Date(item.timestamp).toLocaleDateString()}
                    </Text>
                  </View>
                </View>
                <View style={styles.transactionRight}>
                  <Text
                    style={[
                      styles.transactionAmount,
                      { color: getTransactionColor(item.type) },
                    ]}
                  >
                    {item.type === 'send' ? '-' : '+'}{item.amount.toLocaleString()}
                  </Text>
                  <Text
                    style={[
                      styles.transactionStatus,
                      {
                        color:
                          item.status === 'confirmed'
                            ? '#51cf66'
                            : item.status === 'pending'
                            ? '#ffd43b'
                            : '#ff6b6b',
                      },
                    ]}
                  >
                    {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                  </Text>
                </View>
              </View>
            )}
          />
        )}
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
    borderLeftWidth: 4,
    borderLeftColor: '#00d4ff',
  },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#00d4ff', marginBottom: 12 },
  walletButton: {
    backgroundColor: '#0f0f1e',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderLeftWidth: 2,
    borderLeftColor: '#2a2a3e',
  },
  walletButtonActive: {
    borderLeftColor: '#00d4ff',
    backgroundColor: '#16213e',
  },
  walletButtonContent: { flex: 1 },
  walletName: { fontSize: 14, fontWeight: '600', color: '#ffffff', marginBottom: 4 },
  walletAddress: { fontSize: 11, color: '#888888' },
  walletBalance: { fontSize: 16, fontWeight: 'bold', color: '#00d4ff', marginRight: 4 },
  walletCurrency: { fontSize: 12, color: '#cccccc' },
  balanceBox: {
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: '#0f0f1e',
    borderRadius: 8,
    marginBottom: 12,
  },
  balanceAmount: { fontSize: 36, fontWeight: 'bold', color: '#00d4ff' },
  balanceCurrency: { fontSize: 14, color: '#cccccc', marginTop: 4 },
  fullAddress: {
    fontSize: 11,
    color: '#888888',
    textAlign: 'center',
    fontFamily: 'Courier New',
  },
  actionButton: {
    backgroundColor: '#16213e',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 3,
    borderLeftColor: '#00d4ff',
  },
  actionButtonIcon: { fontSize: 18, marginRight: 12 },
  actionButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3e',
  },
  transactionLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  transactionIcon: { fontSize: 20, marginRight: 12 },
  transactionInfo: { flex: 1 },
  transactionType: { fontSize: 14, fontWeight: '600', color: '#ffffff', marginBottom: 2 },
  transactionTime: { fontSize: 12, color: '#888888' },
  transactionRight: { alignItems: 'flex-end' },
  transactionAmount: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  transactionStatus: { fontSize: 11 },
  emptyText: { color: '#888888', textAlign: 'center', paddingVertical: 12 },
});

export default WalletScreen;
