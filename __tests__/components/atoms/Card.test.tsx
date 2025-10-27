import React from 'react';
import renderer from 'react-test-renderer';
import { Card, Text } from 'src/components';

describe('Card Component', () => {
  describe('rendering', () => {
    it('should render card with children', () => {
      const tree = renderer
        .create(
          <Card>
            <Text>Card Content</Text>
          </Card>,
        )
        .toJSON();
      expect(tree).toMatchSnapshot();
    });

    it('should render empty card', () => {
      const tree = renderer.create(<Card />).toJSON();
      expect(tree).toMatchSnapshot();
    });
  });

  describe('spacing', () => {
    it('should render with different spacing', () => {
      const spacings = ['sm', 'md', 'lg', 'xl'] as const;

      spacings.forEach(spacing => {
        const tree = renderer
          .create(
            <Card spacing={spacing}>
              <Text>Spaced Card</Text>
            </Card>,
          )
          .toJSON();
        expect(tree).toMatchSnapshot();
      });
    });
  });

  describe('multiple children', () => {
    it('should render multiple children', () => {
      const tree = renderer
        .create(
          <Card>
            <Text>First</Text>
            <Text>Second</Text>
            <Text>Third</Text>
          </Card>,
        )
        .toJSON();
      expect(tree).toMatchSnapshot();
    });
  });

  describe('styling', () => {
    it('should apply custom style', () => {
      const customStyle = { backgroundColor: 'red', padding: 20 };
      const tree = renderer
        .create(
          <Card style={customStyle}>
            <Text>Styled Card</Text>
          </Card>,
        )
        .toJSON();

      expect(tree).toMatchSnapshot();
    });
  });
});
