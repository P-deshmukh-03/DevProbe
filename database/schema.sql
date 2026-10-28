-- =============================================================================
-- DevProbe — Initial Database Schema
-- Day 9: MySQL Database Foundation
--
-- This schema establishes the relational database structure for DevProbe persistence:
-- - Collections: Logical grouping of saved API requests
-- - Saved Requests: Request configuration including method, URL, headers, params, body
--
-- Compatibility: MySQL 5.7+ / MySQL 8.0+ / MariaDB 10.4+ (XAMPP compatible)
-- Character Set: utf8mb4 (Full Unicode support including emojis and special symbols)
-- Collation: utf8mb4_unicode_ci
-- Re-runnable: Safe to execute multiple times (CREATE TABLE IF NOT EXISTS)
--
-- Security Notice:
-- In accordance with DevProbe security standards, plaintext passwords, session tokens,
-- and live authorization credentials are NEVER persisted to database tables.
-- =============================================================================

-- 1. Ensure target database exists
CREATE DATABASE IF NOT EXISTS `devprobe_db`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `devprobe_db`;

-- -----------------------------------------------------------------------------
-- Table: collections
-- Groups related API requests into logical folders/collections
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `collections` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_collections_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Table: saved_requests
-- Persists HTTP request configurations linked optionally to a parent collection
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `saved_requests` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `collection_id` INT UNSIGNED NULL,
  `name` VARCHAR(255) NOT NULL,
  `method` VARCHAR(10) NOT NULL,
  `url` TEXT NOT NULL,
  `headers` JSON NULL,
  `params` JSON NULL,
  `body` MEDIUMTEXT NULL,
  `body_type` VARCHAR(20) NOT NULL DEFAULT 'none',
  `auth_type` VARCHAR(20) NOT NULL DEFAULT 'none',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_saved_requests_collection_id` (`collection_id`),
  INDEX `idx_saved_requests_method` (`method`),
  CONSTRAINT `fk_saved_requests_collection`
    FOREIGN KEY (`collection_id`)
    REFERENCES `collections` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

