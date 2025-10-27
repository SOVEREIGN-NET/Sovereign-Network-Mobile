import React from 'react';
import renderer from 'react-test-renderer';
import { Badge } from 'src/components';

describe('Badge Component', () => {
  describe('rendering', () => {
    it('should render badge with label', () => {
      const tree = renderer.create(<Badge label="Active" />).toJSON();
      expect(tree).toMatchSnapshot();
    });

    it('should render badge with icon', () => {
      const tree = renderer
        .create(<Badge label="Success" icon="✓" />)
        .toJSON();
      expect(tree).toMatchSnapshot();
    });

    it('should render badge with numeric label', () => {
      const tree = renderer.create(<Badge label={5} />).toJSON();
      expect(tree).toMatchSnapshot();
    });
  });

  describe('variants', () => {
    it('should render all variants', () => {
      const variants = ['primary', 'success', 'error', 'warning', 'info', 'default'] as const;

      variants.forEach(variant => {
        const tree = renderer
          .create(<Badge label={variant} variant={variant} />)
          .toJSON();
        expect(tree).toMatchSnapshot();
      });
    });
  });

  describe('sizes', () => {
    it('should render all sizes', () => {
      const sizes = ['sm', 'md', 'lg'] as const;

      sizes.forEach(size => {
        const tree = renderer
          .create(<Badge label="Test" size={size} />)
          .toJSON();
        expect(tree).toMatchSnapshot();
      });
    });
  });

  describe('styling', () => {
    it('should apply custom style', () => {
      const customStyle = { marginTop: 10 };
      const tree = renderer
        .create(<Badge label="Test" style={customStyle} />)
        .toJSON();

      expect(tree).toMatchSnapshot();
    });
  });
});
