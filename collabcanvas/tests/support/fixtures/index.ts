/* eslint-disable react-hooks/rules-of-hooks */
/* eslint-disable no-empty-pattern */
import { test as base } from '@playwright/test';
import { UserFactory } from './factories/user-factory';
import { ProjectFactory } from './factories/project-factory';
import { ShapeFactory } from './factories/shape-factory';
import { LayerFactory } from './factories/layer-factory';
import type { Project } from '../../../src/types/project';

/**
 * Test fixtures for CollabCanvas E2E tests
 * 
 * This file extends the base Playwright test with custom fixtures.
 * Follow the pure function → fixture → mergeTests pattern for composability.
 * 
 * @see bmad/bmm/testarch/knowledge/fixture-architecture.md
 */
type TestFixtures = {
  userFactory: UserFactory;
  projectFactory: ProjectFactory;
  shapeFactory: ShapeFactory;
  layerFactory: LayerFactory;
  authenticatedProject: Project;
};

export const test = base.extend<TestFixtures>({
  userFactory: async ({}, use) => {
    const factory = new UserFactory();
    await use(factory);
    // Auto-cleanup: Delete all users created during test
    await factory.cleanup();
  },

  projectFactory: async ({}, use) => {
    const factory = new ProjectFactory();
    await use(factory);
    // Auto-cleanup: Delete all projects created during test
    await factory.cleanup();
  },

  shapeFactory: async ({}, use) => {
    const factory = new ShapeFactory();
    await use(factory);
  },

  layerFactory: async ({}, use) => {
    const factory = new LayerFactory();
    await use(factory);
  },

  authenticatedProject: async ({ projectFactory, userFactory }, use) => {
    // Setup: Create user and project
    const user = userFactory.createUser();
    const project = projectFactory.createProject({ ownerId: user.id });

    // TODO: When authentication is implemented, authenticate user and create project via API
    // For now, track project for cleanup
    projectFactory.trackProject(project.id);

    // Provide project to test
    await use(project);

    // Cleanup handled by projectFactory.cleanup()
  },
});

export { expect } from '@playwright/test';
