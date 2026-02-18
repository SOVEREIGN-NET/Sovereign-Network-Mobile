// ReceiptStore.swift
// Proof-of-Useful-Work Receipt Store
// Sovereign Network Mobile

import Foundation
import CoreData

/// Protocol for receipt storage operations
protocol ReceiptStoreProtocol {
    /// Save a receipt to persistent storage
    func save(receipt: Receipt) async throws
    
    /// Get all receipts with specified state
    func getReceipts(state: ReceiptState) async throws -> [Receipt]
    
    /// Get receipts eligible for submission (queued or retryWait)
    func getPendingReceipts(limit: Int) async throws -> [Receipt]
    
    /// Update receipt state
    func updateState(receiptNonce: Data, state: ReceiptState, error: String?) async throws
    
    /// Update multiple receipt states
    func updateStates(receiptNonces: [Data], state: ReceiptState) async throws
    
    /// Get count of receipts with specified state
    func count(state: ReceiptState) async throws -> Int
    
    /// Get total pending count (queued + retryWait)
    func getPendingCount() async throws -> Int
    
    /// Delete old accepted/rejected receipts
    func cleanup(olderThan: Date) async throws -> Int
    
    /// Delete all receipts (for testing/debugging)
    func deleteAll() async throws
}

/// Core Data backed implementation of ReceiptStore
final class ReceiptStore: ReceiptStoreProtocol {
    
    // MARK: - Singleton
    
    static let shared = ReceiptStore()
    
    // MARK: - Properties
    
    private let container: NSPersistentContainer
    private let containerName = "PoUWReceipts"
    private let entityName = "ReceiptEntity"
    
    private var context: NSManagedObjectContext {
        container.viewContext
    }
    
    // MARK: - Initialization
    
    private init() {
        // Create Core Data container programmatically
        container = NSPersistentContainer(name: containerName)
        
        // Create model programmatically
        let model = Self.createModel()
        container.persistentStoreDescriptions.first?.type = NSSQLiteStoreType
        
        // Replace model
        container.persistentStoreDescriptions.first?.shouldAddStoreAsynchronously = false
        
        // Load store
        container.loadPersistentStores { [weak self] description, error in
            if let error = error {
                print("[ReceiptStore] Failed to load store: \(error)")
                // Try to recover by deleting and recreating
                self?.recoverFromLoadError()
            } else {
                print("[ReceiptStore] Store loaded: \(description.url?.absoluteString ?? "unknown")")
            }
        }
        
        // Set up merge policy
        container.viewContext.automaticallyMergesChangesFromParent = true
        container.viewContext.mergePolicy = NSMergeByPropertyObjectTrumpMergePolicy
    }
    
    /// Create Core Data model programmatically
    private static func createModel() -> NSManagedObjectModel {
        let model = NSManagedObjectModel()
        
        // Create ReceiptEntity description
        let entity = NSEntityDescription()
        entity.name = "ReceiptEntity"
        entity.managedObjectClassName = "ReceiptEntity"
        
        // Create attributes
        let receiptNonceAttr = NSAttributeDescription()
        receiptNonceAttr.name = "receiptNonce"
        receiptNonceAttr.attributeType = .binaryDataAttributeType
        receiptNonceAttr.isOptional = false
        
        let taskIdAttr = NSAttributeDescription()
        taskIdAttr.name = "taskId"
        taskIdAttr.attributeType = .binaryDataAttributeType
        taskIdAttr.isOptional = false
        
        let stateAttr = NSAttributeDescription()
        stateAttr.name = "state"
        stateAttr.attributeType = .stringAttributeType
        stateAttr.isOptional = false
        
        let signedReceiptDataAttr = NSAttributeDescription()
        signedReceiptDataAttr.name = "signedReceiptData"
        signedReceiptDataAttr.attributeType = .binaryDataAttributeType
        signedReceiptDataAttr.isOptional = false
        
        let createdAtAttr = NSAttributeDescription()
        createdAtAttr.name = "createdAt"
        createdAtAttr.attributeType = .dateAttributeType
        createdAtAttr.isOptional = false
        
        let retryCountAttr = NSAttributeDescription()
        retryCountAttr.name = "retryCount"
        retryCountAttr.attributeType = .integer64AttributeType
        retryCountAttr.defaultValue = 0
        retryCountAttr.isOptional = false
        
        let lastErrorAttr = NSAttributeDescription()
        lastErrorAttr.name = "lastError"
        lastErrorAttr.attributeType = .stringAttributeType
        lastErrorAttr.isOptional = true
        
        let providerIdAttr = NSAttributeDescription()
        providerIdAttr.name = "providerId"
        providerIdAttr.attributeType = .binaryDataAttributeType
        providerIdAttr.isOptional = true
        
        entity.properties = [
            receiptNonceAttr,
            taskIdAttr,
            stateAttr,
            signedReceiptDataAttr,
            createdAtAttr,
            retryCountAttr,
            lastErrorAttr,
            providerIdAttr
        ]
        
        // Add unique constraint on receiptNonce
        entity.uniquenessConstraints = [[receiptNonceAttr]]
        
        model.entities = [entity]
        
        return model
    }
    
    /// Attempt to recover from store load error
    private func recoverFromLoadError() {
        guard let storeURL = container.persistentStoreDescriptions.first?.url else {
            return
        }
        
        do {
            try FileManager.default.removeItem(at: storeURL)
            print("[ReceiptStore] Deleted corrupt store, will recreate on next launch")
        } catch {
            print("[ReceiptStore] Failed to delete corrupt store: \(error)")
        }
    }
    
    // MARK: - ReceiptStoreProtocol
    
    /// Save a receipt to persistent storage
    func save(receipt: Receipt) async throws {
        try await performBackgroundTask { context in
            let entity = ReceiptEntity(context: context)
            entity.receiptNonce = receipt.receiptNonce
            entity.taskId = receipt.taskId
            entity.state = receipt.state.rawValue
            entity.signedReceiptData = receipt.signedReceiptData
            entity.createdAt = receipt.createdAt
            entity.retryCount = Int64(receipt.retryCount)
            entity.lastError = receipt.lastError
            entity.providerId = receipt.providerId
            
            try context.save()
        }
    }
    
    /// Get all receipts with specified state
    func getReceipts(state: ReceiptState) async throws -> [Receipt] {
        try await performBackgroundTask { context in
            let request = NSFetchRequest<ReceiptEntity>(entityName: self.entityName)
            request.predicate = NSPredicate(format: "state == %@", state.rawValue)
            request.sortDescriptors = [NSSortDescriptor(key: "createdAt", ascending: true)]
            
            let entities = try context.fetch(request)
            return entities.map { self.convertToReceipt($0) }
        }
    }
    
    /// Get receipts eligible for submission (queued or retryWait)
    func getPendingReceipts(limit: Int = 100) async throws -> [Receipt] {
        try await performBackgroundTask { context in
            let request = NSFetchRequest<ReceiptEntity>(entityName: self.entityName)
            request.predicate = NSPredicate(
                format: "state IN %@",
                [ReceiptState.queued.rawValue, ReceiptState.retryWait.rawValue]
            )
            request.sortDescriptors = [
                NSSortDescriptor(key: "retryCount", ascending: true),
                NSSortDescriptor(key: "createdAt", ascending: true)
            ]
            request.fetchLimit = limit
            
            let entities = try context.fetch(request)
            return entities.map { self.convertToReceipt($0) }
        }
    }
    
    /// Update receipt state
    func updateState(receiptNonce: Data, state: ReceiptState, error: String?) async throws {
        try await performBackgroundTask { context in
            let request = NSFetchRequest<ReceiptEntity>(entityName: self.entityName)
            request.predicate = NSPredicate(format: "receiptNonce == %@", receiptNonce as CVarArg)
            
            let entities = try context.fetch(request)
            
            for entity in entities {
                entity.state = state.rawValue
                if let error = error {
                    entity.lastError = error
                }
                if state == .submitted {
                    entity.retryCount += 1
                }
            }
            
            try context.save()
        }
    }
    
    /// Update multiple receipt states
    func updateStates(receiptNonces: [Data], state: ReceiptState) async throws {
        try await performBackgroundTask { context in
            for nonce in receiptNonces {
                let request = NSFetchRequest<ReceiptEntity>(entityName: self.entityName)
                request.predicate = NSPredicate(format: "receiptNonce == %@", nonce as CVarArg)
                
                let entities = try context.fetch(request)
                
                for entity in entities {
                    entity.state = state.rawValue
                    if state == .submitted {
                        entity.retryCount += 1
                    }
                }
            }
            
            try context.save()
        }
    }
    
    /// Get count of receipts with specified state
    func count(state: ReceiptState) async throws -> Int {
        try await performBackgroundTask { context in
            let request = NSFetchRequest<ReceiptEntity>(entityName: self.entityName)
            request.predicate = NSPredicate(format: "state == %@", state.rawValue)
            
            return try context.count(for: request)
        }
    }
    
    /// Get total pending count (queued + retryWait)
    func getPendingCount() async throws -> Int {
        try await performBackgroundTask { context in
            let request = NSFetchRequest<ReceiptEntity>(entityName: self.entityName)
            request.predicate = NSPredicate(
                format: "state IN %@",
                [ReceiptState.queued.rawValue, ReceiptState.retryWait.rawValue]
            )
            
            return try context.count(for: request)
        }
    }
    
    /// Delete old accepted/rejected receipts
    func cleanup(olderThan: Date) async throws -> Int {
        try await performBackgroundTask { context in
            let request = NSFetchRequest<NSFetchRequestResult>(entityName: self.entityName)
            request.predicate = NSPredicate(
                format: "state IN %@ AND createdAt < %@",
                [ReceiptState.accepted.rawValue, ReceiptState.rejected.rawValue],
                olderThan as CVarArg
            )
            
            let deleteRequest = NSBatchDeleteRequest(fetchRequest: request)
            deleteRequest.resultType = .resultTypeCount
            
            let result = try context.execute(deleteRequest) as? NSBatchDeleteResult
            return result?.result as? Int ?? 0
        }
    }
    
    /// Delete all receipts (for testing/debugging)
    func deleteAll() async throws {
        try await performBackgroundTask { context in
            let request = NSFetchRequest<NSFetchRequestResult>(entityName: self.entityName)
            let deleteRequest = NSBatchDeleteRequest(fetchRequest: request)
            
            try context.execute(deleteRequest)
        }
    }
    
    // MARK: - Private Helpers
    
    /// Perform operation on background context
    private func performBackgroundTask<T>(operation: @escaping (NSManagedObjectContext) throws -> T) async throws -> T {
        return try await withCheckedThrowingContinuation { continuation in
            container.performBackgroundTask { context in
                do {
                    let result = try operation(context)
                    continuation.resume(returning: result)
                } catch {
                    continuation.resume(throwing: PoUWError.storageError(error))
                }
            }
        }
    }
    
    /// Convert Core Data entity to Receipt model
    private func convertToReceipt(_ entity: ReceiptEntity) -> Receipt {
        return Receipt(
            receiptNonce: entity.receiptNonce ?? Data(),
            taskId: entity.taskId ?? Data(),
            signedReceiptData: entity.signedReceiptData ?? Data(),
            providerId: entity.providerId,
            state: ReceiptState(rawValue: entity.state ?? "queued") ?? .queued,
            createdAt: entity.createdAt ?? Date(),
            retryCount: Int(entity.retryCount),
            lastError: entity.lastError
        )
    }
}

// MARK: - Core Data Entity

/// Core Data entity for Receipt storage
@objc(ReceiptEntity)
class ReceiptEntity: NSManagedObject {
    @NSManaged var receiptNonce: Data?
    @NSManaged var taskId: Data?
    @NSManaged var state: String?
    @NSManaged var signedReceiptData: Data?
    @NSManaged var createdAt: Date?
    @NSManaged var retryCount: Int64
    @NSManaged var lastError: String?
    @NSManaged var providerId: Data?
}
